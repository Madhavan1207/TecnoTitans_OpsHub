import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { boot } from './helpers.js';
import { parse, evaluate, computeRecord, checkFormula } from '../../shared/formula.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function sheet(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Components');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('Formula engine: precedence, functions, safety', () => {
  const ev = (s, c = {}) => evaluate(parse(s), c);
  assert.equal(ev('1 + 2 * 3'), 7);
  assert.equal(ev('qty * price', { qty: 4, price: 2.5 }), 10);
  assert.equal(ev('IF(qty > 3, 1, 0)', { qty: 4 }), 1);
  assert.equal(ev('ROUND(10 / 3, 2)'), 3.33);
  assert.throws(() => ev('1 / 0'), /Division by zero/);
  for (const evil of ['process.exit()', 'constructor', '__proto__', 'a.b', 'eval("1")', '1; 2', '`x`']) {
    assert.ok(!checkFormula(evil, ['a', 'b']).ok, `${evil} must be rejected`);
  }
  assert.deepEqual(computeRecord([{ key: 't', formula: 'qty * price' }], { qty: 3, price: 2 }).t, 6);
});

test('Form -> table: calculated field TOTAL = QTY x PRICE is stored, returned and recomputed', async () => {
  const c = await ctx.as('stores').post('/central-stores/components', { sku: 'T-1', name: 'Test part', qty: 12, price: 2.5, reorder_level: 20 });
  assert.equal(c.status, 201);
  assert.equal(c.body.total, 30);
  assert.equal(c.body.shortfall, 8); // MAX(reorder_level - qty, 0)
  assert.equal(c.body.low_stock, true);
  const u = await ctx.as('stores').put(`/central-stores/components/${c.body.id}`, { qty: 40 });
  assert.equal(u.body.total, 100);
  assert.equal(u.body.shortfall, 0);
  const row = (await ctx.as('stores').get(`/central-stores/components/${c.body.id}`)).body;
  assert.equal(row.total, 100);
  const mv = (await ctx.as('stores').get(`/central-stores/components/${c.body.id}/movements`)).body;
  assert.deepEqual(mv.map((m) => m.reason).sort(), ['adjustment', 'receipt']);
});

test('Schema validation: unknown, calculated, wrong type, out of range, duplicate', async () => {
  const post = (b) => ctx.as('stores').post('/central-stores/components', b);
  const base = { sku: 'V-1', name: 'V', qty: 1, price: 1 };
  assert.equal((await post({ ...base, total: 999 })).status, 422, 'calculated fields cannot be set');
  assert.equal((await post({ ...base, sku: 'V-2', bogus: 1 })).status, 422);
  assert.equal((await post({ ...base, sku: 'V-3', qty: 'many' })).status, 422);
  assert.equal((await post({ ...base, sku: 'V-4', qty: -5 })).status, 422);
  assert.equal((await post({ name: 'No sku', qty: 1 })).status, 422);
  const ok = await post(base);
  assert.equal(ok.status, 201);
  const dup = await post(base);
  assert.equal(dup.status, 409);
  const bad = await post({ ...base, sku: 'V-5', qty: 'x', price: 'y' });
  assert.ok(bad.body.details.errors.length >= 1);
  // role: clerks (members) cannot create
  assert.equal((await ctx.as('tech').post('/central-stores/components', { ...base, sku: 'V-6' })).status, 403);
});

test('Custom field config drives the API with no code: Service Centre request requires customer_name', async () => {
  const r = await ctx.as('tech').post('/service-centre/requests', { title: 'x', customer_phone: '9820044444', device_type: 'Phone' });
  assert.equal(r.status, 422);
  assert.match(r.body.message, /Customer name is required/);
  const bad = await ctx.as('tech').post('/service-centre/requests', { title: 'x', customer_name: 'A', customer_phone: '9820044444', device_type: 'Toaster' });
  assert.equal(bad.status, 422);
});

test('DEMO STEP 4: Excel export is role-restricted and contains live formulas', async () => {
  assert.equal((await ctx.as('tech').get('/central-stores/reports/export/components')).status, 403, 'member cannot export');
  assert.equal((await ctx.anon.get('/central-stores/reports/export/components')).status, 401);
  const ex = await ctx.as('stores').get('/central-stores/reports/export/components');
  assert.equal(ex.status, 200);
  assert.match(ex.headers.get('content-type'), /spreadsheetml/);
  assert.match(ex.headers.get('content-disposition'), /central-stores-components-/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(ex.body);
  const ws = wb.getWorksheet('Components');
  const headers = ws.getRow(1).values.slice(1);
  assert.ok(headers.includes('TOTAL') && headers.includes('Unit price'));
  const totalCol = headers.indexOf('TOTAL') + 1;
  const cell = ws.getRow(2).getCell(totalCol).value;
  assert.ok(cell.formula && /\*/.test(cell.formula), `expected an Excel formula, got ${JSON.stringify(cell)}`);
  assert.ok(ws.rowCount - 1 >= 14, 'all components exported');
  // exports honour module presence
  assert.equal((await ctx.as('stores').get('/central-stores/reports/export/requests')).status, 404);
  const svc = await ctx.as('servicemgr').get('/service-centre/reports/export/repairs');
  assert.equal(svc.status, 200);
});

test('DEMO STEP 4: Excel import is admin-only; validation is all-or-nothing; partial mode skips bad rows', async () => {
  const hdr = ['SKU', 'Component', 'Category', 'On hand', 'Unit price', 'Reorder at', 'TOTAL'];
  const good = await sheet([hdr, ['IMP-1', 'Imported 1', 'Misc', 10, 1.5, 5, 'ignored'], ['IMP-2', 'Imported 2', 'Misc', 20, 2, 5, null]]);
  assert.equal((await ctx.as('stores').raw('POST', '/central-stores/reports/import/components', good, { 'content-type': XLSX })).status, 403, 'manager cannot import');
  assert.equal((await ctx.as('tech').raw('POST', '/central-stores/reports/import/components', good, { 'content-type': XLSX })).status, 403);

  const imp = await ctx.as('storeadmin').raw('POST', '/central-stores/reports/import/components', good, { 'content-type': XLSX });
  assert.equal(imp.status, 200, JSON.stringify(imp.body));
  assert.equal(imp.body.created, 2);
  assert.ok(imp.body.ignored.some((x) => /TOTAL/.test(x)), 'calculated column ignored');
  const got = (await ctx.as('stores').get('/central-stores/components?q=IMP-1')).body[0];
  assert.equal(got.total, 15);

  // re-import = upsert, stock change logged as 'import'
  const again = await sheet([hdr, ['IMP-1', 'Imported 1', 'Misc', 50, 1.5, 5, null]]);
  const up = await ctx.as('storeadmin').raw('POST', '/central-stores/reports/import/components', again, { 'content-type': XLSX });
  assert.equal(up.body.updated, 1);
  const mv = (await ctx.as('stores').get(`/central-stores/components/${got.id}/movements`)).body;
  assert.ok(mv.some((m) => m.reason === 'import' && m.delta === 40));

  const mixed = await sheet([hdr, ['IMP-3', 'Fine', 'Misc', 1, 1, 1, null], ['IMP-4', 'Negative', 'Misc', -4, 1, 1, null], ['', 'No sku', 'Misc', 1, 1, 1, null]]);
  const strict = await ctx.as('storeadmin').raw('POST', '/central-stores/reports/import/components', mixed, { 'content-type': XLSX });
  assert.equal(strict.status, 422);
  assert.equal(strict.body.error, 'import_failed');
  assert.equal((await ctx.as('stores').get('/central-stores/components?q=IMP-3')).body.length, 0, 'nothing imported on error');
  assert.ok(strict.body.details.errors.some((e) => e.row === 3));

  const partial = await ctx.as('storeadmin').raw('POST', '/central-stores/reports/import/components?partial=1', mixed, { 'content-type': XLSX });
  assert.equal(partial.status, 200);
  assert.equal(partial.body.created, 1);
  assert.equal(partial.body.skipped, 2);

  const junk = await ctx.as('storeadmin').raw('POST', '/central-stores/reports/import/components', Buffer.from('not a workbook'), { 'content-type': XLSX });
  assert.equal(junk.status, 422);
  const noCols = await sheet([['Foo', 'Bar'], [1, 2]]);
  assert.equal((await ctx.as('storeadmin').raw('POST', '/central-stores/reports/import/components', noCols, { 'content-type': XLSX })).body.error, 'missing_columns');
});

test('Import never writes into another site', async () => {
  const hdr = ['SKU', 'Component', 'On hand'];
  const buf = await sheet([hdr, ['LEAK-1', 'Leak', 5]]);
  const r = await ctx.as('storeadmin').raw('POST', '/distribution/reports/import/components', buf, { 'content-type': XLSX });
  assert.ok([401, 403, 404].includes(r.status));
  assert.equal((await ctx.as('admin').get('/distribution/components?q=LEAK-1')).body.length, 0);
});

test('Reports summary tells the UI what the caller may do', async () => {
  const m = (await ctx.as('tech').get('/central-stores/reports')).body;
  assert.equal(m.can_export, false);
  const a = (await ctx.as('storeadmin').get('/central-stores/reports')).body;
  assert.equal(a.can_export && a.can_import, true);
  assert.deepEqual(a.entities.map((e) => e.entity), ['components']);
});

test('Hub: login, bcrypt, user management', async () => {
  const bad = await ctx.anon.post('/auth/login', { email: 'admin@opshub.dev', password: 'nope' });
  assert.equal(bad.status, 401);
  assert.equal((await ctx.anon.get('/sites')).status, 401);
  assert.equal((await ctx.as('stores').get('/hub/users')).status, 403);
  const created = await ctx.as('admin').post('/hub/users', { email: 'new@opshub.dev', name: 'New User', password: 'longenough1', memberships: [] });
  assert.equal(created.status, 201);
  const login = await ctx.anon.post('/auth/login', { email: 'NEW@opshub.dev', password: 'longenough1' });
  assert.equal(login.status, 200);
  assert.equal((await ctx.as('admin').post('/hub/users', { email: 'x', name: 'x', password: 'short' })).status, 422);
  const sites = await ctx.as('admin').get('/sites');
  const cs = sites.body.find((s) => s.slug === 'central-stores');
  assert.equal((await ctx.as('admin').put(`/hub/users/${created.body.id}/memberships/${cs.id}`, { role: 'member' })).status, 200);
  const tok = login.body.token;
  const mine = await fetch(`${ctx.base}/sites`, { headers: { authorization: `Bearer ${tok}` } }).then((r) => r.json());
  assert.deepEqual(mine.map((s) => s.slug), ['central-stores']);
  // deactivated users lose access immediately (token still valid, user is not)
  await ctx.as('admin').raw('PATCH', `/hub/users/${created.body.id}`, { isActive: false });
  assert.equal((await fetch(`${ctx.base}/sites`, { headers: { authorization: `Bearer ${tok}` } })).status, 401);
  // public directory is anonymous and contains only published sites
  const pub = await ctx.anon.get('/public/sites');
  assert.equal(pub.status, 200);
  assert.deepEqual(pub.body.map((s) => s.slug).sort(), ['central-stores', 'distribution', 'service-centre']);
  // overview for admin spans all sites
  const ov = (await ctx.as('admin').get('/hub/overview')).body;
  assert.equal(ov.length, 3);
});
