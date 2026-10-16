import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

const item = async (slug, sku) => (await ctx.as('admin').get(`/${slug}/components?q=${sku}`)).body.find((i) => i.sku === sku);

test('Service Centre: request -> approval -> repair -> parts -> complete -> return', async () => {
  const create = await ctx.as('tech').post('/service-centre/requests', { title: 'Tablet dead', customer_name: 'Test Customer', customer_phone: '9820011111', device_type: 'Phone', qty: 1 });
  assert.equal(create.status, 201);
  assert.equal(create.body.status, 'pending');
  const id = create.body.id;

  // a technician (member) cannot approve
  const queueTech = await ctx.as('tech').get('/service-centre/approvals');
  assert.equal(queueTech.status, 403);
  const queue = (await ctx.as('servicemgr').get('/service-centre/approvals')).body;
  const appr = queue.find((a) => a.request_id === id);
  assert.ok(appr, 'manager sees the pending approval');

  // reject requires a comment on this site
  assert.equal((await ctx.as('servicemgr').post(`/service-centre/approvals/${appr.id}/decide`, { decision: 'reject' })).status, 422);
  // cannot create a repair from a pending request
  assert.equal((await ctx.as('tech').post('/service-centre/repairs', { request_id: id, device: 'Tab', fault: 'dead' })).status, 409);

  const ok = await ctx.as('servicemgr').post(`/service-centre/approvals/${appr.id}/decide`, { decision: 'approve' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.request_status, 'approved');
  // deciding twice is refused
  assert.equal((await ctx.as('servicemgr').post(`/service-centre/approvals/${appr.id}/decide`, { decision: 'approve' })).status, 409);

  const job = await ctx.as('tech').post('/service-centre/repairs', { request_id: id, device: 'Tab A7', fault: 'No power', labour_cost: 20 });
  assert.equal(job.status, 201);
  assert.equal(job.body.status, 'diagnosing');
  assert.equal(job.body.total_cost, 20); // calculated: labour + parts
  assert.equal(job.body.grand_total, 23.6); // calculated chain: gst = 18%, grand = total + gst

  // returning before completion is refused
  assert.equal((await ctx.as('tech').post('/service-centre/returns', { source_type: 'repair', repair_id: job.body.id })).status, 409);

  const part = await item('service-centre', 'DC-JACK-45');
  const used = await ctx.as('tech').post(`/service-centre/repairs/${job.body.id}/parts`, { item_id: part.id, qty: 2 });
  assert.equal(used.status, 201);
  assert.equal(used.body.parts_cost, 2.4);
  assert.equal(used.body.total_cost, 22.4);
  assert.equal((await item('service-centre', 'DC-JACK-45')).qty, part.qty - 2, 'parts decrement stock');

  assert.equal((await ctx.as('tech').post(`/service-centre/repairs/${job.body.id}/status`, { status: 'nonsense' })).status, 422);
  for (const s of ['repairing', 'testing', 'completed']) assert.equal((await ctx.as('tech').post(`/service-centre/repairs/${job.body.id}/status`, { status: s })).status, 200);
  assert.equal((await ctx.as('tech').get(`/service-centre/requests/${id}`)).body.status, 'fulfilled');

  const ret = await ctx.as('servicemgr').post('/service-centre/returns', { source_type: 'repair', repair_id: job.body.id, condition: 'good' });
  assert.equal(ret.status, 201);
  assert.equal((await ctx.as('tech').get(`/service-centre/repairs/${job.body.id}`)).body.status, 'returned');
});

test('Approval rules: no self-approval, rejection closes request', async () => {
  const mine = await ctx.as('servicemgr').post('/service-centre/requests', { title: 'Own laptop', customer_name: 'Manager', customer_phone: '9820022222', device_type: 'Laptop', qty: 1 });
  const queue = (await ctx.as('servicemgr').get('/service-centre/approvals')).body;
  const a = queue.find((x) => x.request_id === mine.body.id);
  assert.equal((await ctx.as('servicemgr').post(`/service-centre/approvals/${a.id}/decide`, { decision: 'approve' })).status, 403);
  // hub admin (different person) rejects with a reason
  const rej = await ctx.as('admin').post(`/service-centre/approvals/${a.id}/decide`, { decision: 'reject', comment: 'Not covered' });
  assert.equal(rej.body.request_status, 'rejected');
  assert.equal((await ctx.as('servicemgr').post(`/service-centre/requests/${mine.body.id}/cancel`)).status, 409);
});

test('Distribution: assignment decrements stock transactionally', async () => {
  const it = await item('distribution', 'MCB-16A');
  const rq = (await ctx.as('field').post('/distribution/requests', { title: 'MCBs', item_id: it.id, qty: 5, field_site: 'Site Z' })).body;
  assert.equal(rq.status, 'approved', 'no approval module on Distribution -> auto-approved');
  const ready = (await ctx.as('dispatch').get('/distribution/assignments/ready')).body;
  assert.ok(ready.find((r) => r.id === rq.id));

  // members cannot assign
  assert.equal((await ctx.as('field').post('/distribution/assignments', { request_id: rq.id, assigned_to: 'x' })).status, 403);
  const a = await ctx.as('dispatch').post('/distribution/assignments', { request_id: rq.id, assigned_to: 'Crew 7', assignee_id: undefined, vehicle_no: 'MH-01-1' });
  assert.equal(a.status, 201);
  assert.equal((await item('distribution', 'MCB-16A')).qty, it.qty - 5);
  assert.equal((await ctx.as('field').get(`/distribution/requests/${rq.id}`)).body.status, 'assigned');
  // double assignment refused, stock untouched
  assert.equal((await ctx.as('dispatch').post('/distribution/assignments', { request_id: rq.id, assigned_to: 'Crew 8' })).status, 409);
  assert.equal((await item('distribution', 'MCB-16A')).qty, it.qty - 5);
});

test('Distribution: insufficient stock leaves EVERYTHING unchanged (rollback)', async () => {
  const it = await item('distribution', 'CAB-CAT6-305');
  const rq = (await ctx.as('field').post('/distribution/requests', { title: 'Too many', item_id: it.id, qty: it.qty + 100, field_site: 'Site Q' })).body;
  const before = await ctx.as('dispatch').get('/distribution/assignments');
  const r = await ctx.as('dispatch').post('/distribution/assignments', { request_id: rq.id, assigned_to: 'Crew' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'insufficient_stock');
  assert.equal((await item('distribution', 'CAB-CAT6-305')).qty, it.qty);
  assert.equal((await ctx.as('field').get(`/distribution/requests/${rq.id}`)).body.status, 'approved', 'request stays approved');
  assert.equal((await ctx.as('dispatch').get('/distribution/assignments')).body.length, before.body.length, 'no assignment row left behind');
});

test('Distribution: 8 concurrent assignments of one request -> exactly one wins, stock drops once', async () => {
  const it = await item('distribution', 'TERM-BLK-12');
  const rq = (await ctx.as('field').post('/distribution/requests', { title: 'Race', item_id: it.id, qty: 10, field_site: 'Race site' })).body;
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => ctx.as('dispatch').post('/distribution/assignments', { request_id: rq.id, assigned_to: `Crew ${i}` })));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409));
  assert.equal((await item('distribution', 'TERM-BLK-12')).qty, it.qty - 10);
});

test('Distribution: concurrent requests competing for scarce stock never oversell', async () => {
  const it = await item('distribution', 'CAB-CAT6-305');
  const reqs = [];
  for (let i = 0; i < 4; i++) reqs.push((await ctx.as('field').post('/distribution/requests', { title: `Compete ${i}`, item_id: it.id, qty: 8, field_site: 'S' })).body);
  const res = await Promise.all(reqs.map((r) => ctx.as('dispatch').post('/distribution/assignments', { request_id: r.id, assigned_to: 'C' })));
  const won = res.filter((r) => r.status === 201).length;
  const expected = Math.min(4, Math.floor(it.qty / 8));
  assert.ok(expected >= 1);
  assert.equal(won, expected, `${it.qty} in stock / 8 each = exactly ${expected} can succeed`);
  assert.equal((await item('distribution', 'CAB-CAT6-305')).qty, it.qty - 8 * expected);
  assert.ok((await item('distribution', 'CAB-CAT6-305')).qty >= 0);
});

test('Consumption: cannot use more than issued; members only see their own', async () => {
  const asg = (await ctx.as('dispatch').get('/distribution/assignments')).body.find((a) => a.remaining > 0 && a.assignee_id);
  assert.ok(asg);
  const over = await ctx.as('field').post('/distribution/consumption', { assignment_id: asg.id, qty: asg.remaining + 1 });
  assert.equal(over.status, 409);
  const one = await ctx.as('field').post('/distribution/consumption', { assignment_id: asg.id, qty: 1, note: 'test' });
  assert.equal(one.status, 201);
  assert.equal(one.body.remaining, asg.remaining - 1);
  const mine = (await ctx.as('field').get('/distribution/assignments')).body;
  assert.ok(mine.every((a) => a.assignee_id));
});

test('Returns need the module: disabled on Distribution until enabled', async () => {
  assert.equal((await ctx.as('dispatch').get('/distribution/returns')).status, 404);
});

test('Stock can never go negative (API + DB check)', async () => {
  const it = await item('central-stores', 'XTAL-8M');
  const r = await ctx.as('stores').post(`/central-stores/components/${it.id}/adjust`, { delta: -(it.qty + 1) });
  assert.equal(r.status, 409);
  assert.equal((await item('central-stores', 'XTAL-8M')).qty, it.qty);
});

test('Public intake: only on sites that enable it, and rate-limited fields are validated', async () => {
  const form = await ctx.anon.get('/service-centre/public/form');
  assert.equal(form.status, 200);
  assert.ok(form.body.fields.some((f) => f.key === 'customer_name'));
  const ok = await ctx.anon.post('/service-centre/public/requests', { title: 'Walk-in TV', customer_name: 'Walk In', customer_phone: '9820033333', device_type: 'TV' });
  assert.equal(ok.status, 201);
  assert.match(ok.body.label, /^SC-\d+$/);
  assert.equal((await ctx.anon.post('/service-centre/public/requests', { title: 'x' })).status, 422); // customer_name required
  assert.equal((await ctx.anon.get('/distribution/public/form')).status, 404);
  assert.equal((await ctx.anon.get('/service-centre/requests')).status, 401); // public cannot list
});
