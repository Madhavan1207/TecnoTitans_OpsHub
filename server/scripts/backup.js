// Offline backup: dumps every table to one JSON file (works without pg_dump).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { adminUrl } from '../src/db.js';

import { TABLES } from './tables.js';

const out = process.argv[2] || path.resolve(import.meta.dirname, '../../backup/demo-snapshot.json');
const c = new pg.Client({ connectionString: adminUrl() });
await c.connect();
const snap = { format: 'opshub-snapshot-1', created_at: new Date().toISOString(), tables: {} };
for (const t of TABLES) snap.tables[t] = (await c.query(`SELECT * FROM ${t} ORDER BY 1`)).rows;
await c.end();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(snap));
console.log(`Backup written: ${out}  (${TABLES.map((t) => `${t}:${snap.tables[t].length}`).join(' ')})`);
