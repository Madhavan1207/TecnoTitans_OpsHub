// Site lifecycle service: create, save draft, validate, publish (versioned), rollback.
import { db, withHub } from './db.js';
import { HttpError, clearConfigCache } from './core.js';
import { normalizeConfig, validateConfig, diffConfigs, emptyConfig, isValidSlug } from '../../shared/validate.js';
import { PRESETS, buildFromModules } from '../../shared/presets.js';

export async function createSite({ name, slug, tagline = '', preset = null, config = null, actorId = null, publish = false }) {
  slug = String(slug || '').toLowerCase();
  if (!name?.trim()) throw new HttpError(422, 'Name is required.', 'validation_failed');
  if (!isValidSlug(slug)) throw new HttpError(422, 'Slug must be 3-40 lowercase letters, numbers or dashes (and not a reserved word).', 'validation_failed');
  if ((await db().query('SELECT 1 FROM sites WHERE slug = $1', [slug])).length) throw new HttpError(409, `The slug "${slug}" is already taken.`, 'duplicate');
  let cfg;
  if (config) cfg = normalizeConfig({ ...config, name, slug });
  else {
    const base = emptyConfig({ name, slug });
    base.tagline = tagline;
    const p = preset ? PRESETS.find((x) => x.key === preset) : null;
    if (preset && !p) throw new HttpError(422, 'Unknown preset.', 'validation_failed');
    cfg = p ? buildFromModules(base, p.modules) : base;
  }
  cfg.name = name; cfg.slug = slug; cfg.tagline = tagline || cfg.tagline || '';
  const [site] = await db().query(
    'INSERT INTO sites (slug, name, tagline, theme, draft_config) VALUES ($1,$2,$3,$4,$5) RETURNING *', [slug, name, cfg.tagline, JSON.stringify(cfg.theme), JSON.stringify(cfg)]);
  if (actorId) await db().query("INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,'admin') ON CONFLICT DO NOTHING", [site.id, actorId]);
  if (publish) await publishDraft(site.id, actorId, 'Initial release');
  return (await db().query('SELECT * FROM sites WHERE id = $1', [site.id]))[0];
}

export async function saveDraft(site, incoming) {
  const cfg = normalizeConfig({ ...incoming, slug: site.slug }); // slug is immutable
  const validation = validateConfig(cfg);
  await db().query('UPDATE sites SET draft_config = $2, name = $3, updated_at = now() WHERE id = $1', [site.id, JSON.stringify(cfg), cfg.name || site.name]);
  return { config: cfg, validation };
}

export async function publishDraft(siteId, actorId, note = '') {
  return withHub(async (t) => {
    const site = await t.one('SELECT * FROM sites WHERE id = $1 FOR UPDATE', [siteId]);
    if (!site) throw new HttpError(404, 'Site not found.');
    const cfg = normalizeConfig(site.draft_config);
    const validation = validateConfig(cfg);
    if (!validation.ok) throw new HttpError(422, `Cannot publish: ${validation.errors[0].message}`, 'invalid_config', { errors: validation.errors, warnings: validation.warnings });
    const live = site.published_version_id ? await t.one('SELECT version, config FROM site_versions WHERE id = $1', [site.published_version_id]) : null;
    if (live && JSON.stringify(normalizeConfig(live.config)) === JSON.stringify(cfg)) throw new HttpError(409, 'Nothing to publish - the draft is identical to the live version.', 'no_changes');
    const next = ((await t.one('SELECT COALESCE(max(version),0) AS v FROM site_versions WHERE site_id = $1', [siteId])).v) + 1;
    const ver = await t.one('INSERT INTO site_versions (site_id, version, config, note, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [siteId, next, JSON.stringify(cfg), note || '', actorId]);
    await t.exec('UPDATE sites SET published_version_id = $2, name = $3, tagline = $4, theme = $5, updated_at = now() WHERE id = $1', [siteId, ver.id, cfg.name, cfg.tagline || '', JSON.stringify(cfg.theme)]);
    await t.exec("INSERT INTO deploy_history (site_id, action, version, from_version, note, actor_id) VALUES ($1,'publish',$2,$3,$4,$5)", [siteId, next, live?.version || null, note || '', actorId]);
    clearConfigCache(siteId);
    return { version: next, previous: live?.version || null, warnings: validation.warnings, diff: diffConfigs(live?.config, cfg) };
  });
}

export async function rollbackTo(siteId, version, actorId, note = '') {
  return withHub(async (t) => {
    const site = await t.one('SELECT * FROM sites WHERE id = $1 FOR UPDATE', [siteId]);
    const target = await t.one('SELECT * FROM site_versions WHERE site_id = $1 AND version = $2', [siteId, Number(version) || 0]);
    if (!target) throw new HttpError(404, `Version ${version} does not exist for this site.`);
    const live = site.published_version_id ? await t.one('SELECT version FROM site_versions WHERE id = $1', [site.published_version_id]) : null;
    if (live?.version === target.version) throw new HttpError(409, `Version ${target.version} is already live.`, 'no_changes');
    const cfg = normalizeConfig(target.config);
    await t.exec('UPDATE sites SET published_version_id = $2, draft_config = $3, name = $4, tagline = $5, theme = $6, updated_at = now() WHERE id = $1',
      [siteId, target.id, JSON.stringify(cfg), cfg.name, cfg.tagline || '', JSON.stringify(cfg.theme)]);
    await t.exec("INSERT INTO deploy_history (site_id, action, version, from_version, note, actor_id) VALUES ($1,'rollback',$2,$3,$4,$5)", [siteId, target.version, live?.version || null, note || `Rolled back to v${target.version}`, actorId]);
    clearConfigCache(siteId);
    return { version: target.version, previous: live?.version || null };
  });
}
