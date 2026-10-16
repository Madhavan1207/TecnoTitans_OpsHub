// Everything under /api/:siteId/* — one router, scoped by site, gated by module + role.
import { Router } from 'express';
import { siteContext, guard, h, HttpError, authRequired } from '../core.js';
import { db } from '../db.js';
import inventory from './inventory.js';
import { requestsRouter, approvalsRouter, assignmentsRouter, publicIntakeRouter } from './workflow.js';
import { consumptionRouter, repairsRouter, returnsRouter } from './tracking.js';
import { analyticsRouter, reportsRouter } from './insight.js';
import { roleLabel, RESOURCE_MODULE } from '../../../shared/registry.js';

const r = Router({ mergeParams: true });
r.use(siteContext);

// Who am I on this site + the live config (this is what the renderer boots from).
r.get('/config', h(async (req, res) => {
  res.json({
    site: { id: req.site.id, slug: req.site.slug, name: req.site.name },
    role: req.role, role_label: roleLabel(req.config, req.role), preview: !!req.preview,
    version: req.site.published_version_id, config: req.config,
  });
}));

r.use('/public', publicIntakeRouter);

// Every resource below requires a signed-in member; per-action roles are enforced by guard().
r.use(authRequired);
r.use('/components', inventory);
r.use('/requests', requestsRouter);
r.use('/approvals', approvalsRouter);
r.use('/assignments', assignmentsRouter);
r.use('/consumption', consumptionRouter);
r.use('/returns', returnsRouter);
r.use('/repairs', repairsRouter);
r.use('/analytics', analyticsRouter);
r.use('/reports', reportsRouter);

/* ---- members (User Management module) ---- */
const members = Router({ mergeParams: true });
members.get('/', guard('user_management', 'list'), h(async (req, res) => {
  const rows = await db().query(
    `SELECT u.id AS user_id, u.name, u.email, u.hub_role, m.role FROM site_members m JOIN users u ON u.id = m.user_id WHERE m.site_id = $1 ORDER BY u.name`, [req.site.id]);
  res.json(rows);
}));
members.put('/:userId', guard('user_management', 'manage'), h(async (req, res) => {
  const role = req.body?.role;
  if (!['member', 'manager', 'admin'].includes(role)) throw new HttpError(422, 'role must be member, manager or admin.', 'validation_failed');
  const email = req.body?.email;
  let userId = Number(req.params.userId);
  if (!userId && email) userId = (await db().query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]))[0]?.id;
  const [u] = await db().query('SELECT id FROM users WHERE id = $1 AND is_active', [userId]);
  if (!u) throw new HttpError(404, 'No active user with that id.');
  await db().query(`INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (site_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [req.site.id, userId, role]);
  res.json({ user_id: userId, role });
}));
members.post('/', guard('user_management', 'manage'), h(async (req, res) => {
  const { email, role = 'member' } = req.body || {};
  if (!email) throw new HttpError(422, 'email is required.', 'validation_failed');
  if (!['member', 'manager', 'admin'].includes(role)) throw new HttpError(422, 'Invalid role.', 'validation_failed');
  const [u] = await db().query('SELECT id, name FROM users WHERE lower(email) = lower($1) AND is_active', [email]);
  if (!u) throw new HttpError(404, 'No hub user with that email. Ask a hub admin to create the account first.');
  await db().query(`INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (site_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [req.site.id, u.id, role]);
  res.status(201).json({ user_id: u.id, name: u.name, role });
}));
members.delete('/:userId', guard('user_management', 'manage'), h(async (req, res) => {
  if (Number(req.params.userId) === req.user.id) throw new HttpError(409, 'You cannot remove yourself.', 'conflict');
  await db().query('DELETE FROM site_members WHERE site_id = $1 AND user_id = $2', [req.site.id, Number(req.params.userId) || 0]);
  res.json({ removed: true });
}));
r.use('/members', members);

// Unknown resource under a real site -> clean 404 rather than falling through.
r.use((req, _res, next) => next(new HttpError(404, `Unknown resource. Known: ${Object.keys(RESOURCE_MODULE).join(', ')}.`)));
export default r;
