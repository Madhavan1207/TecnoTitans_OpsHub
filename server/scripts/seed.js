import { migrate, initDb, closeDb } from '../src/db.js';
import { seedDemo, DEMO_PASSWORD, ADMIN_PASSWORD } from './seedLib.js';
if (process.argv.includes('--reset')) await migrate({ reset: true }); else await migrate();
await initDb();
const done = await seedDemo();
if (done) console.log(`\nLogins:\n  admin@opshub.dev (hub admin)  ${ADMIN_PASSWORD}\n  stores@opshub.dev, storeadmin@opshub.dev, servicemgr@opshub.dev, tech@opshub.dev, dispatch@opshub.dev, field@opshub.dev  ${DEMO_PASSWORD}`);
await closeDb();
