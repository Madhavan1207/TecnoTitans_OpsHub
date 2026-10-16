import { createApp } from './app.js';
import { initDb, db, driverName } from './db.js';
import { seedDemo } from '../scripts/seedLib.js';

if (process.argv.includes('--offline')) process.env.OPSHUB_DB = 'pglite';
const PORT = Number(process.env.PORT || 4000);
await initDb();
if (driverName() === 'pglite') {
  console.log('[opshub] OFFLINE MODE: running an in-process PostgreSQL (PGlite) and loading the demo data...');
  await seedDemo({ quiet: true });
} else {
  const [{ n }] = await db().query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'sites'");
  if (!n) { console.error('[opshub] Database is empty. Run: npm run db:migrate && npm run db:seed'); process.exit(1); }
}
createApp().listen(PORT, () => console.log(`[opshub] API + app on http://localhost:${PORT}  (db: ${driverName()})`));
