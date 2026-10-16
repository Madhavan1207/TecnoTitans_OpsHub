// Creates the database named in DATABASE_URL if it does not exist (no psql / createdb needed - works on Windows).
import pg from 'pg';
import { adminUrl } from '../src/db.js';

const target = new URL(adminUrl());
const name = target.pathname.slice(1);
const root = new URL(adminUrl());
root.pathname = '/postgres';
const c = new pg.Client({ connectionString: root.toString() });
try {
  await c.connect();
} catch (e) {
  console.error(`\nCould not connect to PostgreSQL at ${root.host} as "${root.username}": ${e.message}\n` +
    'Check that PostgreSQL is running and that DATABASE_URL in the .env file has the right password.\n' +
    'No PostgreSQL? Use the offline mode instead:  npm run start:offline');
  process.exit(1);
}
const { rowCount } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
if (rowCount) console.log(`Database "${name}" already exists.`);
else { await c.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`); console.log(`Database "${name}" created.`); }
await c.end();
