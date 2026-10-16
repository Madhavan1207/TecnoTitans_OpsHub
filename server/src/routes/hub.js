// Hub layer: global login, user management, site catalogue, builder persistence (draft / publish / rollback).
import { Router } from 'express';
import { db, withSite } from '../db.js';
import { HttpError, h, authRequired, hubAdminRequired, hashPassword, verifyPassword, signToken, findSite, siteRole, rateLimit, publishedConfig } from '../core.js';
import { MODULES, PORT_TYPES, ROLES, GROUPS, roleAtLeast, moduleConfig, hasModule, roleLabel } from '../../../shared/registry.js';
import { PRESETS } from '../../../shared/presets.js';
import { validateConfig, normalizeConfig, diffConfigs } from '../../../shared/validate.js';
import { createSite, saveDraft, publishDraft, rollbackTo } from '../sites.js';

const r = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, hubRole: u.hub_role });

/* ---------------- auth ---------------- */
r.post('/auth/login', rateLimit({ max: 15, name: 'login' }), h(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError(422, 'Email and password are required.', 'validation_failed');
  const [u] = await db().query('SELECT * FROM users WHERE lower(email) = lower($1)', [String(email)]);
  const ok = u && u.is_active && (await verifyPassword(String(password), u.password_hash));
  if (!ok) throw new HttpError(401, 'Wrong email or password.', 'bad_credentials');
  res.json({ token: signToken(u), user: publicUser(u) });
}));
r.get('/auth/me', authRequired, h(async (req, res) => res.json({ user: publicUser(req.user) })));

/* ---------------- catalogue (Hub: module catalogue) ---------------- */
r.get('/registry', (_req, res) => res.json({ modules: MODULES, groups: GROUPS, portTypes: PORT_TYPES, presets: PRESETS, roles: ROLES }));

/* ---------------- Public ---------------- */
r.get('/public/sites', h(async (_req, res) => {
  const rows = await db().query('SELECT slug, name, tagline, theme FROM sites WHERE is_active AND published_version_id IS NOT NULL ORDER BY name');
  const out = [];
  for (const s of rows) {
    const full = await findSite(s.slug);
    const cfg = await publishedConfig(full);
    out.push({ ...s, public_intake: !!(hasModule(cfg, 'request') && moduleConfig(cfg, 'request').publicIntake) });
  }
  res.json(out);
}));
r.get('/public/sites/:slug', h(async (req, res) => {
  const s = await findSite(req.params.slug);
  if (!s || !s.is_active || !s.published_version_id) throw new HttpError(404, 'Site not found.');
  const cfg = await publishedConfig(s);
  res.json({ slug: s.slug, name: s.name, tagline: s.tagline, theme: s.theme, public_intake: !!(hasModule(cfg, 'request') && moduleConfig(cfg, 'request').publicIntake) });
}));

/* ---------------- sites the caller can open ---------------- */
async function accessibleSites(user) {
  const rows = user.hub_role === 'admin'
    ? await db().query("SELECT s.*, 'admin' AS role FROM sites s WHERE s.is_active ORDER BY s.name")
    : await db().query('SELECT s.*, m.role FROM sites s JOIN site_members m ON m.site_id = s.id WHERE s.is_active AND m.user_id = $1 ORDER BY s.name', [user.id]);
  const out = [];
  for (const s of rows) {
    const cfg = s.published_version_id ? await publishedConfig(s) : null;
    const [v] = s.published_version_id ? await db().query('SELECT version FROM site_versions WHERE id = $1', [s.published_version_id]) : [];
    out.push({
      id: s.id, slug: s.slug, name: s.name, tagline: s.tagline, theme: s.theme, role: s.role, role_label: cfg ? roleLabel(cfg, s.role) : s.role,
      published: !!cfg, version: v?.version || null, modules: cfg ? cfg.modules.map((m) => m.type) : [], updated_at: s.updated_at,
    });
  }
  return out;
}
r.get('/sites', authRequired, h(async (req, res) => res.json(await accessibleSites(req.user))));

r.post('/sites', authRequired, hubAdminRequired, h(async (req, res) => {
  const { name, slug, tagline, preset, publish } = req.body || {};
  const s = await createSite({ name, slug, tagline, preset, actorId: req.user.id, publish: publish !== false });
  res.status(201).json({ id: s.id, slug: s.slug, name: s.name });
}));

/** Cross-unit overview for the Hub dashboard (each site is queried inside its own RLS scope). */
r.get('/hub/overview', authRequired, h(async (req, res) => {
  const sites = (await accessibleSites(req.user)).filter((s) => s.published);
  const rows = await Promise.all(sites.map(async (s) => {
    const cfg = await publishedConfig(await findSite(s.slug));
    const stats = await withSite(s.id, async (t) => {
      const o = {};
      if (hasModule(cfg, 'inventory')) {
        const x = await t.one('SELECT count(*)::int AS items, COALESCE(sum(qty*price),0)::float AS value, count(*) FILTER (WHERE reorder_level > 0 AND qty <= reorder_level)::int AS low FROM inventory_items WHERE site_id = $1', [s.id]);
        Object.assign(o, { items: x.items, stock_value: x.value, low_stock: x.low });
      }
      if (hasModule(cfg, 'request')) o.open_requests = (await t.one("SELECT count(*)::int AS n FROM requests WHERE site_id = $1 AND status IN ('pending','approved')", [s.id])).n;
      if (hasModule(cfg, 'material_assignment')) o.assignments = (await t.one('SELECT count(*)::int AS n FROM assignments WHERE site_id = $1', [s.id])).n;
      if (hasModule(cfg, 'pcb_repair')) o.open_repairs = (await t.one("SELECT count(*)::int AS n FROM repair_jobs WHERE site_id = $1 AND status NOT IN ('completed','returned')", [s.id])).n;
      return o;
    });
    return { slug: s.slug, name: s.name, role: s.role, ...stats };
  }));
  res.json(rows);
}));

/* ---------------- per-site builder persistence ---------------- */
const siteAdmin = h(async (req, _res, next) => {
  const site = await findSite(req.params.id);
  if (!site) throw new HttpError(404, 'Site not found.');
  if (!req.user) throw new HttpError(401, 'Please sign in.');
  const role = await siteRole(req.user, site.id);
  if (!roleAtLeast(role, 'admin')) throw new HttpError(403, 'Only site admins can use the builder.');
  req.site = site; req.role = role;
  next();
});

r.get('/sites/:id/builder', siteAdmin, h(async (req, res) => {
  const live = req.site.published_version_id ? (await db().query('SELECT version, config FROM site_versions WHERE id = $1', [req.site.published_version_id]))[0] : null;
  const draft = normalizeConfig(req.site.draft_config);
  res.json({
    site: { id: req.site.id, slug: req.site.slug, name: req.site.name }, draft, validation: validateConfig(draft),
    live_version: live?.version || null, has_unpublished_changes: !live || JSON.stringify(normalizeConfig(live.config)) !== JSON.stringify(draft),
    diff: diffConfigs(live?.config, draft),
  });
}));
r.put('/sites/:id/draft', siteAdmin, h(async (req, res) => {
  if (!req.body?.config || typeof req.body.config !== 'object') throw new HttpError(422, 'config is required.', 'validation_failed');
  res.json(await saveDraft(req.site, req.body.config));
}));
r.post('/sites/:id/validate', siteAdmin, h(async (req, res) => {
  res.json(validateConfig(normalizeConfig(req.body?.config || req.site.draft_config)));
}));
r.post('/sites/:id/publish', siteAdmin, h(async (req, res) => {
  if (req.body?.config) await saveDraft(req.site, req.body.config); // "single save": persist + publish together
  res.status(201).json(await publishDraft(req.site.id, req.user.id, String(req.body?.note || '').slice(0, 200)));
}));
r.post('/sites/:id/rollback', siteAdmin, h(async (req, res) => {
  res.json(await rollbackTo(req.site.id, req.body?.version, req.user.id, String(req.body?.note || '').slice(0, 200)));
}));
r.get('/sites/:id/versions', siteAdmin, h(async (req, res) => {
  const rows = await db().query(`SELECT v.id, v.version, v.note, v.created_at, u.name AS created_by_name, v.config FROM site_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.site_id = $1 ORDER BY v.version DESC`, [req.site.id]);
  const asc = [...rows].reverse();
  const out = rows.map((v) => {
    const prev = asc[asc.findIndex((x) => x.version === v.version) - 1];
    return { id: v.id, version: v.version, note: v.note, created_at: v.created_at, created_by_name: v.created_by_name, is_live: v.id === req.site.published_version_id,
      modules: normalizeConfig(v.config).modules.map((m) => m.type), diff: diffConfigs(prev?.config, v.config) };
  });
  res.json(out);
}));
r.get('/sites/:id/versions/:version', siteAdmin, h(async (req, res) => {
  const [v] = await db().query('SELECT version, config, note, created_at FROM site_versions WHERE site_id = $1 AND version = $2', [req.site.id, Number(req.params.version) || 0]);
  if (!v) throw new HttpError(404, 'Version not found.');
  res.json(v);
}));
r.get('/sites/:id/deploys', siteAdmin, h(async (req, res) => {
  res.json(await db().query(`SELECT d.*, u.name AS actor_name FROM deploy_history d LEFT JOIN users u ON u.id = d.actor_id WHERE d.site_id = $1 ORDER BY d.id DESC LIMIT 100`, [req.site.id]));
}));
r.delete('/sites/:id', authRequired, hubAdminRequired, h(async (req, res) => {
  const s = await findSite(req.params.id);
  if (!s) throw new HttpError(404, 'Site not found.');
  await db().query('UPDATE sites SET is_active = FALSE, updated_at = now() WHERE id = $1', [s.id]); // archive: data is kept
  res.json({ archived: true });
}));

/* ---------------- hub user management ---------------- */
r.get('/hub/users', authRequired, hubAdminRequired, h(async (_req, res) => {
  const users = await db().query('SELECT id, email, name, hub_role, is_active, created_at FROM users ORDER BY name');
  const mem = await db().query('SELECT m.user_id, m.site_id, m.role, s.slug, s.name AS site_name FROM site_members m JOIN sites s ON s.id = m.site_id WHERE s.is_active');
  res.json(users.map((u) => ({ ...u, memberships: mem.filter((m) => m.user_id === u.id) })));
}));
r.post('/hub/users', authRequired, hubAdminRequired, h(async (req, res) => {
  const { email, name, password, hubRole = 'user', memberships = [] } = req.body || {};
  if (!EMAIL.test(email || '')) throw new HttpError(422, 'A valid email is required.', 'validation_failed');
  if (!name?.trim()) throw new HttpError(422, 'Name is required.', 'validation_failed');
  if (String(password || '').length < 8) throw new HttpError(422, 'Password must be at least 8 characters.', 'validation_failed');
  if (!['admin', 'user'].includes(hubRole)) throw new HttpError(422, 'Invalid hub role.', 'validation_failed');
  if ((await db().query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])).length) throw new HttpError(409, 'A user with that email already exists.', 'duplicate');
  const [u] = await db().query('INSERT INTO users (email, name, password_hash, hub_role) VALUES ($1,$2,$3,$4) RETURNING id, email, name, hub_role', [email.trim(), name.trim(), await hashPassword(password), hubRole]);
  for (const m of memberships) if (['member', 'manager', 'admin'].includes(m.role)) await db().query('INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [Number(m.siteId), u.id, m.role]);
  res.status(201).json(u);
}));
r.patch('/hub/users/:id', authRequired, hubAdminRequired, h(async (req, res) => {
  const id = Number(req.params.id);
  const { name, isActive, password, hubRole } = req.body || {};
  if (id === req.user.id && (isActive === false || hubRole === 'user')) throw new HttpError(409, 'You cannot lock yourself out.', 'conflict');
  const sets = []; const vals = [id];
  const add = (c, v) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (name !== undefined) add('name', String(name).trim());
  if (isActive !== undefined) add('is_active', !!isActive);
  if (hubRole !== undefined) { if (!['admin', 'user'].includes(hubRole)) throw new HttpError(422, 'Invalid hub role.', 'validation_failed'); add('hub_role', hubRole); }
  if (password !== undefined) { if (String(password).length < 8) throw new HttpError(422, 'Password must be at least 8 characters.', 'validation_failed'); add('password_hash', await hashPassword(password)); }
  if (!sets.length) throw new HttpError(422, 'Nothing to update.', 'validation_failed');
  const [u] = await db().query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING id, email, name, hub_role, is_active`, vals);
  if (!u) throw new HttpError(404, 'User not found.');
  res.json(u);
}));
r.put('/hub/users/:id/memberships/:siteId', authRequired, hubAdminRequired, h(async (req, res) => {
  const uid = Number(req.params.id); const sid = Number(req.params.siteId); const role = req.body?.role;
  if (role === null) { await db().query('DELETE FROM site_members WHERE user_id = $1 AND site_id = $2', [uid, sid]); return res.json({ removed: true }); }
  if (!['member', 'manager', 'admin'].includes(role)) throw new HttpError(422, 'role must be member, manager, admin or null.', 'validation_failed');
  await db().query('INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (site_id, user_id) DO UPDATE SET role = EXCLUDED.role', [sid, uid, role]);
  res.json({ user_id: uid, site_id: sid, role });
}));

export default r;
