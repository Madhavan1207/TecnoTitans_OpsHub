import { migrate } from '../src/db.js';
const reset = process.argv.includes('--reset');
await migrate({ reset });
console.log(reset ? 'Schema reset and migrated.' : 'Schema migrated.');
