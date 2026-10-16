import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { addModule, removeModule, validateConfig, connect, isValidConnection, emptyConfig } from '../../shared/validate.js';
import { applyPreset } from '../../shared/presets.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

const draft = async (slug) => (await ctx.as('admin').get(`/sites/${slug}/builder`)).body;

test('Typed nodes: Approval cannot be added without Request; edges are type-checked', () => {
  let c = emptyConfig();
  assert.match(addModule(c, 'approval').error, /needs Request/);
  assert.match(addModule(c, 'material_assignment').error, /needs/);
  c = addModule(addModule(c, 'inventory').config, 'request').config;
  c = addModule(c, 'approval').config;
  assert.ok(c.edges.some((e) => e.id === 'request->approval:request'), 'auto-wired');
  // Inventory (stock) cannot feed Approval's request port
  assert.equal(isValidConnection(c, { source: 'inventory', target: 'approval', targetHandle: 'request' }).ok, false);
  // Request cannot be removed while Approval depends on it
  assert.match(removeModule(c, 'request').error, /Remove Approval first/);
  // Removing a core module is refused
  assert.match(removeModule(c, 'auth_rbac').error, /cannot be removed/);
  // Adding Approval re-routes Material Assignment through approvals
  c = addModule(c, 'material_assignment').config;
  assert.ok(c.edges.some((e) => e.source === 'approval' && e.target === 'material_assignment'));
  // validator catches hand-edited bad graphs
  const bad = JSON.parse(JSON.stringify(c));
  bad.edges = bad.edges.filter((e) => e.target !== 'approval');
  assert.ok(validateConfig(bad).errors.some((e) => e.code === 'edge.missing'));
  bad.edges.push({ source: 'inventory', target: 'approval', targetHandle: 'request' });
  assert.ok(validateConfig(bad).errors.some((e) => e.code === 'edge.type'));
  assert.equal(connect(c, { source: 'inventory', target: 'approval', targetHandle: 'request' }).error.includes('accepts'), true);
});

test('Presets build valid sites', () => {
  for (const p of ['inventory_starter', 'approval_chain', 'repair_shop']) assert.equal(validateConfig(applyPreset(emptyConfig(), p)).ok, true, p);
});

test('Server rejects publishing a broken graph (422) but still saves the draft', async () => {
  const b = await draft('distribution');
  const cfg = JSON.parse(JSON.stringify(b.draft));
  cfg.edges = cfg.edges.filter((e) => e.target !== 'material_assignment' || e.targetHandle !== 'stock');
  const save = await ctx.as('admin').put('/sites/distribution/draft', { config: cfg });
  assert.equal(save.status, 200);
  assert.equal(save.body.validation.ok, false);
  const pub = await ctx.as('admin').post('/sites/distribution/publish', { note: 'should fail' });
  assert.equal(pub.status, 422);
  assert.equal(pub.body.error, 'invalid_config');
  // live site unaffected
  assert.equal((await ctx.as('dispatch').get('/distribution/components')).status, 200);
  // restore a good draft for later tests
  const restore = await ctx.as('admin').put('/sites/distribution/draft', { config: b.draft });
  assert.equal(restore.body.validation.ok, true);
});

test('Bad formulas / fields are caught by schema validation', async () => {
  const b = await draft('central-stores');
  const mutate = (fn) => { const c = JSON.parse(JSON.stringify(b.draft)); fn(c.modules.find((m) => m.type === 'inventory').config.fields); return c; };
  const cases = [
    [(f) => f.push({ key: 'x', label: 'X', type: 'number', formula: 'qty * nothere' }), 'formula.invalid'],
    [(f) => f.push({ key: 'a', label: 'A', type: 'number', formula: 'b + 1' }, { key: 'b', label: 'B', type: 'number', formula: 'a + 1' }), 'formula.cycle'],
    [(f) => f.push({ key: 'Bad Key', label: 'Bad', type: 'text' }), 'field.key'],
    [(f) => f.push({ key: 'sku', label: 'dup', type: 'text' }), 'field.duplicate'],
    [(f) => f.push({ key: 'status', label: 'Reserved', type: 'text' }), 'field.reserved'],
    [(f) => f.push({ key: 'dd', label: 'DD', type: 'select', options: [] }), 'field.options'],
    [(f) => f.push({ key: 'nm', label: 'Name x', type: 'number', formula: 'name * 2' }), 'formula.type'],
  ];
  for (const [fn, code] of cases) {
    const r = (await ctx.as('admin').put('/sites/central-stores/draft', { config: mutate(fn) })).body.validation;
    assert.ok(r.errors.some((e) => e.code === code), `expected ${code}, got ${r.errors.map((e) => e.code)}`);
  }
  await ctx.as('admin').put('/sites/central-stores/draft', { config: b.draft });
});

test('Only site admins can use the builder; the slug is immutable', async () => {
  assert.equal((await ctx.as('stores').get('/sites/central-stores/builder')).status, 403); // manager
  assert.equal((await ctx.as('tech').put('/sites/central-stores/draft', { config: {} })).status, 403);
  assert.equal((await ctx.anon.get('/sites/central-stores/builder')).status, 401);
  assert.equal((await ctx.as('storeadmin').get('/sites/central-stores/builder')).status, 200); // site admin (not hub admin)
  assert.equal((await ctx.as('storeadmin').get('/sites/distribution/builder')).status, 403);
  const b = await draft('central-stores');
  const r = await ctx.as('admin').put('/sites/central-stores/draft', { config: { ...b.draft, slug: 'hijacked' } });
  assert.equal(r.body.config.slug, 'central-stores');
});

test('DEMO STEP 3: enable Returns on Distribution -> preview -> publish -> live with no restart', async () => {
  const admin = ctx.as('admin');
  assert.equal((await ctx.as('dispatch').get('/distribution/returns')).status, 404, 'disabled before');
  const b = await draft('distribution');
  const { addModule: add } = await import('../../shared/validate.js');
  const next = add(b.draft, 'return_management');
  assert.ok(!next.error, next.error);
  assert.ok(next.config.edges.some((e) => e.source === 'material_assignment' && e.target === 'return_management'), 'auto-wired to assignments');
  assert.equal((await admin.put('/sites/distribution/draft', { config: next.config })).body.validation.ok, true);

  // still disabled for real users until published
  assert.equal((await ctx.as('dispatch').get('/distribution/returns')).status, 404);
  // preview (admin only, read-only) already shows it
  assert.equal((await admin.get('/distribution/returns', { 'x-opshub-preview': '1' })).status, 200);
  assert.equal((await ctx.as('dispatch').get('/distribution/config', { 'x-opshub-preview': '1' })).status, 403);
  assert.equal((await admin.post('/distribution/returns', {}, { 'x-opshub-preview': '1' })).status, 409);
  const prevCfg = (await admin.get('/distribution/config', { 'x-opshub-preview': '1' })).body;
  assert.equal(prevCfg.preview, true);
  assert.ok(prevCfg.config.pages.some((p) => p.module === 'return_management'));

  const pub = await admin.post('/sites/distribution/publish', { note: 'Enable returns' });
  assert.equal(pub.status, 201);
  assert.equal(pub.body.version, 2);
  assert.deepEqual(pub.body.diff.added, ['return_management']);
  // live immediately, same process
  assert.equal((await ctx.as('dispatch').get('/distribution/returns')).status, 200);
  const live = (await ctx.as('field').get('/distribution/config')).body;
  assert.ok(live.config.pages.some((p) => p.path === 'returns'));
  // publishing again with no change is refused
  assert.equal((await admin.post('/sites/distribution/publish', {})).status, 409);

  // returns now work end to end: restock good material
  const asg = (await ctx.as('dispatch').get('/distribution/assignments')).body.find((a) => a.remaining > 0);
  const item = (await ctx.as('dispatch').get(`/distribution/components?q=${asg.item_sku}`)).body[0];
  const ret = await ctx.as('field').post('/distribution/returns', { source_type: 'assignment', assignment_id: asg.id, qty: 1, condition: 'good', reason: 'unused' });
  assert.equal(ret.status, 201);
  assert.equal((await ctx.as('dispatch').get(`/distribution/components?q=${asg.item_sku}`)).body[0].qty, item.qty + 1, 'good return restocks');
  const dmg = await ctx.as('field').post('/distribution/returns', { source_type: 'assignment', assignment_id: asg.id, qty: 1, condition: 'damaged' });
  assert.equal(dmg.status, 201);
  assert.equal((await ctx.as('dispatch').get(`/distribution/components?q=${asg.item_sku}`)).body[0].qty, item.qty + 1, 'damaged return is NOT restocked');
  assert.equal((await ctx.as('field').post('/distribution/returns', { source_type: 'assignment', assignment_id: asg.id, qty: 9999 })).status, 409);
});

test('Release history, rollback and deploy log', async () => {
  const admin = ctx.as('admin');
  const versions = (await admin.get('/sites/distribution/versions')).body;
  assert.deepEqual(versions.map((v) => v.version), [2, 1]);
  assert.equal(versions[0].is_live, true);
  const rb = await admin.post('/sites/distribution/rollback', { version: 1 });
  assert.equal(rb.status, 200);
  assert.equal((await ctx.as('dispatch').get('/distribution/returns')).status, 404, 'rolled back => returns gone again');
  assert.equal((await admin.post('/sites/distribution/rollback', { version: 1 })).status, 409);
  assert.equal((await admin.post('/sites/distribution/rollback', { version: 99 })).status, 404);
  const log = (await admin.get('/sites/distribution/deploys')).body;
  assert.deepEqual(log.map((d) => `${d.action}:v${d.version}`), ['rollback:v1', 'publish:v2', 'publish:v1']);
  assert.equal(log[0].from_version, 2);
  // data survived the round trip (releases change configuration, never data)
  assert.ok((await ctx.as('dispatch').get('/distribution/assignments')).body.length >= 4);
  // roll forward again
  assert.equal((await admin.post('/sites/distribution/rollback', { version: 2 })).status, 200);
  assert.equal((await ctx.as('dispatch').get('/distribution/returns')).status, 200);
});

test('Sites: create from preset, hub admin only, appears in hub for admin only', async () => {
  assert.equal((await ctx.as('stores').post('/sites', { name: 'X Site', slug: 'x-site' })).status, 403);
  const made = await ctx.as('admin').post('/sites', { name: 'Test Lab', slug: 'test-lab', preset: 'approval_chain' });
  assert.equal(made.status, 201);
  assert.equal((await ctx.as('admin').post('/sites', { name: 'dup', slug: 'test-lab' })).status, 409);
  assert.equal((await ctx.as('admin').post('/sites', { name: 'bad', slug: 'API' })).status, 422);
  assert.equal((await ctx.as('stores').get('/test-lab/config')).body.role ?? 'public', 'public');
  const cfg = (await ctx.as('admin').get('/test-lab/config')).body;
  assert.deepEqual(cfg.config.modules.map((m) => m.type).filter((t) => !['auth_rbac', 'dashboard_shell'].includes(t)), ['inventory', 'request', 'approval', 'material_assignment', 'assignment_frontend']);
  const mySites = (await ctx.as('stores').get('/sites')).body.map((s) => s.slug);
  assert.ok(!mySites.includes('test-lab'));
  // a brand-new site is isolated and empty
  assert.equal((await ctx.as('admin').get('/test-lab/components')).body.length, 0);
});
