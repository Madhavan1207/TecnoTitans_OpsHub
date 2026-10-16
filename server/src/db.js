// Database access.
//  - Driver "pg"     : real PostgreSQL (default). The app connects as the NON-superuser role `opshub_app`
//                      so Row Level Security is always enforced.
//  - Driver "pglite" : in-process PostgreSQL (WASM) for the zero-install OFFLINE demo. We `SET LOCAL ROLE opshub_app`
//                      inside every transaction so the very same RLS policies apply.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

pg.types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC -> number
pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT (counts) -> number

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export const BUSINESS_TABLES = [
  'site_counters', 'inventory_items', 'stock_movements', 'requests', 'approvals', 'assignments',
  'consumption_logs', 'repair_jobs', 'repair_logs', 'returns', 'audit_log', 'notifications',
];

let driver = null;
export const driverName = () => driver?.name;

function appUrl() {
  if (process.env.APP_DATABASE_URL) return process.env.APP_DATABASE_URL;
  const admin = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/opshub';
  const u = new URL(admin);
  u.username = 'opshub_app';
  u.password = 'opshub_app';
  return u.toString();
}
export const adminUrl = () => process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/opshub';

function wrapTx(client, siteId) {
  const run = async (sql, params = []) => (await client.query(sql, params)).rows;
  return {
    siteId,
    rows: run,
    one: async (sql, params) => (await run(sql, params))[0] || null,
    exec: async (sql, params) => { await run(sql, params); },
  };
}

async function makePg() {
  const pool = new pg.Pool({ connectionString: appUrl(), max: 10 });
  pool.on('error', (e) => console.error('[pg pool]', e.message));
  return {
    name: 'pg',
    pool,
    async query(sql, params = []) { return (await pool.query(sql, params)).rows; },
    async tx(fn, { siteId } = {}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (siteId != null) await client.query("SELECT set_config('app.site_id', $1, true)", [String(siteId)]);
        const out = await fn(wrapTx(client, siteId));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        throw e;
      } finally { client.release(); }
    },
    async close() { await pool.end(); },
  };
}

async function makePglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = process.env.PGLITE_DIR || 'memory://';
  const db = new PGlite(dataDir, {
    parsers: { 1700: (v) => parseFloat(v), 20: (v) => parseInt(v, 10) },
  });
  await db.waitReady;
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '001_schema.sql'), 'utf8');
  await db.exec(sql);
  return {
    name: 'pglite',
    async query(q, params = []) { return (await db.query(q, params)).rows; },
    async tx(fn, { siteId } = {}) {
      return db.transaction(async (t) => {
        await t.query('SET LOCAL ROLE opshub_app');
        if (siteId != null) await t.query("SELECT set_config('app.site_id', $1, true)", [String(siteId)]);
        return fn(wrapTx(t, siteId));
      });
    },
    async close() { await db.close(); },
  };
}

export async function initDb() {
  if (driver) return driver;
  driver = process.env.OPSHUB_DB === 'pglite' ? await makePglite() : await makePg();
  if (driver.name === 'pg') {
    const [me] = await driver.query('SELECT current_user AS u, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user');
    if (me.rolsuper || me.rolbypassrls) {
      const msg = `Connected as "${me.u}" which bypasses Row Level Security. Use the opshub_app role (APP_DATABASE_URL) so site isolation is enforced by PostgreSQL.`;
      if (process.env.NODE_ENV === 'production') throw new Error(msg);
      console.warn(`[opshub] WARNING: ${msg}`);
    }
  }
  return driver;
}
export function db() {
  if (!driver) throw new Error('DB not initialised');
  return driver;
}
export async function closeDb() { if (driver) { await driver.close(); driver = null; } }

/** Run fn inside a transaction scoped to one site. PostgreSQL RLS + ScopedRepo both enforce site_id. */
export const withSite = (siteId, fn) => db().tx((t) => fn(t, new ScopedRepo(t, siteId)), { siteId });
/** Run fn inside a plain transaction for hub-level (global) tables. */
export const withHub = (fn) => db().tx((t) => fn(t));

/* ---------------- ORM-level isolation: every statement carries site_id ---------------- */

const COL = /^[a-z_][a-z0-9_]*$/;
const jsonish = (v) => (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) ? JSON.stringify(v) : v);

export class ScopedRepo {
  constructor(t, siteId) {
    if (!Number.isInteger(siteId)) throw new Error('ScopedRepo needs an integer siteId');
    this.t = t;
    this.siteId = siteId;
  }
  _table(name) {
    if (!BUSINESS_TABLES.includes(name)) throw new Error(`"${name}" is not a business table`);
    return name;
  }
  _where(where = {}, startAt = 2) {
    const parts = ['site_id = $1'];
    const vals = [this.siteId];
    for (const [k, v] of Object.entries(where)) {
      if (k === 'site_id') continue; // callers can never override the scope
      if (!COL.test(k)) throw new Error(`Bad column ${k}`);
      if (v === null) parts.push(`${k} IS NULL`);
      else { vals.push(v); parts.push(`${k} = $${vals.length}`); }
    }
    void startAt;
    return { sql: parts.join(' AND '), vals };
  }
  async select(table, { where = {}, orderBy = 'id', dir = 'ASC', limit = 1000, forUpdate = false } = {}) {
    if (!COL.test(orderBy)) throw new Error('Bad order column');
    const w = this._where(where);
    return this.t.rows(
      `SELECT * FROM ${this._table(table)} WHERE ${w.sql} ORDER BY ${orderBy} ${dir === 'DESC' ? 'DESC' : 'ASC'} LIMIT ${Math.min(Number(limit) || 1000, 5000)}${forUpdate ? ' FOR UPDATE' : ''}`,
      w.vals,
    );
  }
  async get(table, id, { forUpdate = false } = {}) {
    if (!Number.isInteger(Number(id))) return null;
    return this.t.one(`SELECT * FROM ${this._table(table)} WHERE site_id = $1 AND id = $2${forUpdate ? ' FOR UPDATE' : ''}`, [this.siteId, Number(id)]);
  }
  async findOne(table, where, opts = {}) {
    const w = this._where(where);
    return this.t.one(`SELECT * FROM ${this._table(table)} WHERE ${w.sql} LIMIT 1${opts.forUpdate ? ' FOR UPDATE' : ''}`, w.vals);
  }
  async count(table, where = {}) {
    const w = this._where(where);
    const r = await this.t.one(`SELECT count(*)::int AS n FROM ${this._table(table)} WHERE ${w.sql}`, w.vals);
    return r.n;
  }
  async insert(table, row) {
    const cols = ['site_id'];
    const vals = [this.siteId];
    for (const [k, v] of Object.entries(row)) {
      if (k === 'site_id' || v === undefined) continue;
      if (!COL.test(k)) throw new Error(`Bad column ${k}`);
      cols.push(k);
      vals.push(jsonish(v));
    }
    return this.t.one(`INSERT INTO ${this._table(table)} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
  }
  async update(table, id, patch) {
    const sets = [];
    const vals = [this.siteId, Number(id)];
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'site_id' || k === 'id' || v === undefined) continue;
      if (!COL.test(k)) throw new Error(`Bad column ${k}`);
      vals.push(jsonish(v));
      sets.push(`${k} = $${vals.length}`);
    }
    if (!sets.length) return this.get(table, id);
    return this.t.one(`UPDATE ${this._table(table)} SET ${sets.join(', ')} WHERE site_id = $1 AND id = $2 RETURNING *`, vals);
  }
  async delete(table, id) {
    return this.t.one(`DELETE FROM ${this._table(table)} WHERE site_id = $1 AND id = $2 RETURNING id`, [this.siteId, Number(id)]);
  }
  /** Race-free per-site sequence (REQ-1, REQ-2...). */
  async nextNo(name) {
    const r = await this.t.one(
      `INSERT INTO site_counters (site_id, name, value) VALUES ($1, $2, 1)
       ON CONFLICT (site_id, name) DO UPDATE SET value = site_counters.value + 1 RETURNING value`,
      [this.siteId, name],
    );
    return r.value;
  }
  audit(actorId, action, entity, entityId, detail = {}) {
    return this.insert('audit_log', { actor_id: actorId || null, action, entity, entity_id: entityId || null, detail });
  }
}

/* ---------------- migrations (run as the admin / owner) ---------------- */

export async function migrate({ reset = false } = {}) {
  const client = new pg.Client({ connectionString: adminUrl() });
  await client.connect();
  try {
    if (reset) await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, '001_schema.sql'), 'utf8'));
  } finally { await client.end(); }
}
