// Restore a snapshot made by backup.js into a freshly migrated database.  WARNING: wipes the target database.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { adminUrl, migrate } from '../src/db.js';
import { TABLES, NO_ID } from './tables.js';

const file = process.argv[2] || path.resolve(import.meta.dirname, '../../backup/demo-snapshot.json');
const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
await migrate({ reset: true });
const c = new pg.Client({ connectionString: adminUrl() });
await c.connect();
await c.query('BEGIN');
await c.query("SET LOCAL session_replication_role = 'replica'"); // skip FK checks while loading (circular sites <-> versions)
for (const t of TABLES) {
  const rows = snap.tables[t] || [];
  if (rows.length) await c.query(`INSERT INTO ${t} SELECT * FROM jsonb_populate_recordset(NULL::${t}, $1::jsonb)`, [JSON.stringify(rows)]);
  if (NO_ID.includes(t)) continue;
  const seq = await c.query('SELECT pg_get_serial_sequence($1, $2) AS s', [t, 'id']);
  if (seq.rows[0]?.s) await c.query(`SELECT setval($1, GREATEST((SELECT COALESCE(max(id),0) FROM ${t}), 1))`, [seq.rows[0].s]);
}
await c.query('COMMIT');
await c.end();
console.log(`Restored ${file}`);
