import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db } from './db.js';
import { normalizeConfig } from '../../shared/validate.js';
import { actionMinRole, hasModule, moduleConfig, roleAtLeast, MODULE_MAP } from '../../shared/registry.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'opshub-dev-secret-change-me';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

export class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code || ({ 400: 'bad_request', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 422: 'invalid' }[status] || 'error');
    this.details = details;
  }
}
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_ROUNDS);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function signToken(user, hours = 8) {
  return jwt.sign({ sub: user.id, hub: user.hub_role }, JWT_SECRET, { expiresIn: `${hours}h` });
}

/** Parses the bearer token (if any) and loads the live user row. Never rejects: anonymous = Public. */
export const authOptional = h(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET);
      const [u] = await db().query('SELECT id, email, name, hub_role, is_active FROM users WHERE id = $1', [payload.sub]);
      if (u && u.is_active) req.user = u;
    } catch { /* invalid or expired token = anonymous */ }
  }
  next();
});
export const authRequired = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Please sign in.')));
export const hubAdminRequired = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  if (req.user.hub_role !== 'admin') return next(new HttpError(403, 'Hub administrators only.'));
  next();
};

/* --------------------------- sites + roles --------------------------- */

export async function findSite(ref) {
  const isId = /^\d+$/.test(String(ref));
  const rows = await db().query(
    `SELECT * FROM sites WHERE ${isId ? 'id = $1' : 'slug = $1'}`, [isId ? Number(ref) : String(ref).toLowerCase()],
  );
  return rows[0] || null;
}

export async function siteRole(user, siteId) {
  if (!user) return 'public';
  if (user.hub_role === 'admin') return 'admin';
  const [m] = await db().query('SELECT role FROM site_members WHERE site_id = $1 AND user_id = $2', [siteId, user.id]);
  return m ? m.role : 'public';
}

const cache = new Map(); // `${siteId}:${versionId}` -> config
export const clearConfigCache = (siteId) => { for (const k of cache.keys()) if (k.startsWith(`${siteId}:`)) cache.delete(k); };

export async function publishedConfig(site) {
  if (!site.published_version_id) return null;
  const key = `${site.id}:${site.published_version_id}`;
  if (!cache.has(key)) {
    const [v] = await db().query('SELECT config FROM site_versions WHERE id = $1', [site.published_version_id]);
    cache.set(key, v ? normalizeConfig(v.config) : null);
  }
  return cache.get(key);
}

/** Resolves :siteId, caller role and the LIVE config for every /api/:siteId/* request. */
export const siteContext = h(async (req, _res, next) => {
  const site = await findSite(req.params.siteId);
  if (!site || !site.is_active) throw new HttpError(404, 'Site not found.', 'site_not_found');
  req.site = site;
  req.role = await siteRole(req.user, site.id);
  const wantsPreview = req.headers['x-opshub-preview'] === '1';
  if (wantsPreview) {
    if (req.role !== 'admin') throw new HttpError(403, 'Only site admins can preview unpublished changes.');
    if (req.method !== 'GET') throw new HttpError(409, 'Preview is read-only. Publish to make changes live.', 'preview_read_only');
    req.config = normalizeConfig(site.draft_config);
    req.preview = true;
  } else {
    req.config = await publishedConfig(site);
  }
  if (!req.config) throw new HttpError(409, 'This site has not been published yet.', 'not_published');
  next();
});

/** Per-module, per-action gate: module must be enabled in the live config AND the caller's role high enough. */
export const guard = (moduleKey, action) => (req, _res, next) => {
  if (!hasModule(req.config, moduleKey)) {
    return next(new HttpError(404, `${MODULE_MAP[moduleKey].label} is not enabled on this site.`, 'module_disabled'));
  }
  const min = actionMinRole(req.config, moduleKey, action);
  if (!roleAtLeast(req.role, min)) {
    return next(req.user ? new HttpError(403, `This needs the ${min} role or higher on this site.`) : new HttpError(401, 'Please sign in.'));
  }
  req.mod = moduleConfig(req.config, moduleKey);
  next();
};

/** Module must be enabled; any role (incl. Public) may call. Used for read-only capability summaries. */
export const moduleOnly = (moduleKey) => (req, _res, next) => {
  if (!hasModule(req.config, moduleKey)) return next(new HttpError(404, `${MODULE_MAP[moduleKey].label} is not enabled on this site.`, 'module_disabled'));
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  if (!roleAtLeast(req.role, 'member')) return next(new HttpError(403, 'You are not a member of this site.'));
  next();
};

export const canDo = (req, moduleKey, action) => roleAtLeast(req.role, actionMinRole(req.config, moduleKey, action));

/* --------------------------- tiny rate limiter --------------------------- */
export function rateLimit({ windowMs = 60_000, max = 20, name = 'rl' } = {}) {
  const hits = new Map();
  return (req, _res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    if (arr.length > max) return next(new HttpError(429, 'Too many attempts. Please wait a minute.', 'rate_limited'));
    next();
  };
}

export function pgErrorToHttp(e) {
  if (e.status) return e;
  const map = {
    '23505': [409, 'That value already exists.', 'duplicate'],
    '23503': [409, 'This record is linked to other records.', 'in_use'],
    '23514': [409, 'That change would break a data rule (for example stock below zero).', 'constraint'],
    '42501': [403, 'Blocked by site isolation (row level security).', 'rls'],
    '22P02': [422, 'Invalid value.', 'invalid'],
  };
  const m = map[e.code];
  return m ? new HttpError(m[0], m[1], m[2], { constraint: e.constraint }) : e;
}
