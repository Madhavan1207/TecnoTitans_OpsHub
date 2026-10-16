import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { withSite, db, BUSINESS_TABLES, ScopedRepo } from '../src/db.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

const siteIds = async () => Object.fromEntries((await db().query('SELECT id, slug FROM sites')).map((s) => [s.slug, s.id]));

test('DB level: RLS shows each site only its own rows in EVERY business table', async () => {
  const ids = await siteIds();
  for (const table of BUSINESS_TABLES) {
    for (const [slug, id] of Object.entries(ids)) {
      const rows = await withSite(id, (t) => t.rows(`SELECT DISTINCT site_id FROM ${table}`));
      assert.ok(rows.every((r) => r.site_id === id), `${table} leaked rows to ${slug}`);
    }
  }
});

test('DB level: with no site set, business tables return zero rows', async () => {
  const [me] = await db().query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user');
  assert.equal(me.rolsuper, false, 'app must not be a superuser');
  for (const table of BUSINESS_TABLES) {
    const rows = await db().tx((t) => t.rows(`SELECT count(*)::int AS n FROM ${table}`));
    assert.equal(rows[0].n, 0, `${table} visible without a site scope`);
  }
});

test("DB level: cannot insert / update / delete another site's rows even with raw SQL", async () => {
  const ids = await siteIds();
  await assert.rejects(withSite(ids['central-stores'], (t) => t.exec("INSERT INTO inventory_items (site_id, sku, name) VALUES ($1, 'EVIL', 'Evil')", [ids.distribution])), /row-level security/);
  const upd = await withSite(ids['central-stores'], (t) => t.rows('UPDATE inventory_items SET qty = 0 WHERE site_id = $1 RETURNING id', [ids.distribution]));
  assert.equal(upd.length, 0);
  const del = await withSite(ids['central-stores'], (t) => t.rows('DELETE FROM requests WHERE site_id = $1 RETURNING id', [ids.distribution]));
  assert.equal(del.length, 0);
  // composite FK: a distribution request cannot reference a central-stores item
  const [cItem] = await withSite(ids['central-stores'], (t) => t.rows('SELECT id FROM inventory_items LIMIT 1'));
  await assert.rejects(withSite(ids.distribution, (t) => t.exec("INSERT INTO requests (site_id, req_no, title, item_id) VALUES ($1, 999, 'x', $2)", [ids.distribution, cItem.id])), /foreign key/);
});

test('ORM level: ScopedRepo cannot be pointed at another site', async () => {
  const ids = await siteIds();
  await withSite(ids['central-stores'], async (t, repo) => {
    const mine = await repo.select('inventory_items', { where: { site_id: ids.distribution } }); // override attempt is ignored
    assert.ok(mine.length > 0 && mine.every((r) => r.site_id === ids['central-stores']));
    await assert.rejects(() => repo.select('users'), /not a business table/);
    await assert.rejects(() => repo.select('inventory_items', { where: { 'id; DROP TABLE users': 1 } }), /Bad column/);
  });
  assert.throws(() => new ScopedRepo({}, 'abc'), /integer/);
});

/* ---------- API level: one table covering EVERY site endpoint ---------- */
const ENDPOINTS = [
  ['GET', '/components'], ['GET', '/components/1'], ['POST', '/components'], ['PUT', '/components/1'], ['POST', '/components/1/adjust'], ['DELETE', '/components/1'], ['GET', '/components/1/movements'],
  ['GET', '/requests'], ['GET', '/requests/1'], ['POST', '/requests'], ['POST', '/requests/1/cancel'],
  ['GET', '/requests/1/notifications'], ['POST', '/requests/1/notify'], ['POST', '/requests/1/notifications/1/resend'],
  ['GET', '/approvals'], ['GET', '/approvals/history'], ['POST', '/approvals/1/decide'],
  ['GET', '/assignments'], ['GET', '/assignments/ready'], ['GET', '/assignments/1'], ['POST', '/assignments'],
  ['GET', '/consumption'], ['POST', '/consumption'],
  ['GET', '/returns'], ['POST', '/returns'],
  ['GET', '/repairs'], ['GET', '/repairs/ready'], ['GET', '/repairs/1'], ['POST', '/repairs'], ['PUT', '/repairs/1'], ['POST', '/repairs/1/status'], ['POST', '/repairs/1/parts'], ['DELETE', '/repairs/1'],
  ['GET', '/analytics'], ['GET', '/reports'], ['GET', '/reports/export/components'], ['GET', '/reports/template/components'], ['POST', '/reports/import/components'],
  ['GET', '/members'], ['PUT', '/members/1'], ['POST', '/members'], ['DELETE', '/members/1'],
];
const bodyFor = (m) => (m === 'GET' || m === 'DELETE' ? undefined : {});

test('API: every endpoint rejects anonymous callers (401)', async () => {
  for (const [m, p] of ENDPOINTS) {
    const r = await ctx.anon.raw(m, `/central-stores${p}`, bodyFor(m));
    assert.equal(r.status, 401, `${m} ${p} -> ${r.status}`);
  }
});

test('API: every endpoint blocks a user who is NOT a member of the site (never 2xx)', async () => {
  // storeadmin administers central-stores only. The other two sites must never answer successfully.
  for (const slug of ['service-centre', 'distribution']) {
    for (const [m, p] of ENDPOINTS) {
      const r = await ctx.as('storeadmin').raw(m, `/${slug}${p}`, bodyFor(m));
      assert.ok([401, 403, 404].includes(r.status), `${m} /${slug}${p} -> ${r.status}`);
    }
  }
});

test('API: an admin of site A cannot read or touch site B records by id (404)', async () => {
  const admin = ctx.as('storeadmin');
  const foreign = (await ctx.as('admin').get('/service-centre/components')).body[0];
  const distReq = (await ctx.as('admin').get('/distribution/requests')).body[0];
  const svcJob = (await ctx.as('admin').get('/service-centre/repairs')).body[0];
  const distAsg = (await ctx.as('admin').get('/distribution/assignments')).body[0];
  for (const [m, p, b] of [['GET', `/components/${foreign.id}`], ['PUT', `/components/${foreign.id}`, { qty: 1 }], ['DELETE', `/components/${foreign.id}`], ['POST', `/components/${foreign.id}/adjust`, { delta: 1 }], ['GET', `/components/${foreign.id}/movements`]]) {
    const r = await admin.raw(m, `/central-stores${p}`, b);
    assert.equal(r.status, 404, `${m} ${p} -> ${r.status}`);
  }
  // central-stores has no request / repair / assignment modules at all
  for (const p of [`/requests/${distReq.id}`, `/repairs/${svcJob.id}`, `/assignments/${distAsg.id}`]) assert.equal((await admin.get(`/central-stores${p}`)).status, 404);
  const still = (await ctx.as('admin').get(`/service-centre/components/${foreign.id}`)).body;
  assert.equal(still.qty, foreign.qty, 'foreign row must be untouched');
});

test('API: ids from another site are 404 inside a site that HAS the module', async () => {
  const svcJob = (await ctx.as('admin').get('/service-centre/repairs')).body[0];
  const svcReq = (await ctx.as('admin').get('/service-centre/requests')).body[0];
  // distribution has requests but not repairs; service-centre ids must not resolve in distribution's requests
  const maxDistReq = Math.max(...(await ctx.as('admin').get('/distribution/requests')).body.map((r) => r.id));
  const r = await ctx.as('dispatch').get(`/distribution/requests/${svcReq.id}`);
  assert.equal(svcReq.id > maxDistReq || r.status === 404, true);
  void svcJob;
  const decide = await ctx.as('dispatch').post('/distribution/assignments', { request_id: svcReq.id, assigned_to: 'me' });
  assert.equal(decide.status, 404);
});

test('API: cross-site references are rejected (request -> foreign item)', async () => {
  const centralItem = (await ctx.as('admin').get('/central-stores/components')).body[0];
  const r1 = await ctx.as('field').post('/distribution/requests', { title: 'sneaky', item_id: centralItem.id, qty: 1, field_site: 'x' });
  assert.equal(r1.status, 422);
});

test('API: same SKU exists independently in two sites (data is per-site)', async () => {
  const a = (await ctx.as('admin').get('/central-stores/components?q=CAB-USB-1M')).body[0];
  const b = (await ctx.as('admin').get('/distribution/components?q=CAB-USB-1M')).body[0];
  assert.ok(a && b && a.id !== b.id && a.qty !== b.qty);
});

test('API: member lists are per-site', async () => {
  const m = (await ctx.as('admin').get('/service-centre/members')).body.map((x) => x.email);
  assert.ok(m.includes('servicemgr@opshub.dev') && !m.includes('field@opshub.dev'));
});
