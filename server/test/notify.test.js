import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { normalizePhone } from '../src/notify.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

const msgs = async (id, who = 'servicemgr') => (await ctx.as(who).get(`/service-centre/requests/${id}/notifications`)).body;
const findReq = async (label) => (await ctx.as('servicemgr').get('/service-centre/requests')).body.find((r) => r.label === label);

test('Phone numbers are normalised to E.164 (default +91)', () => {
  assert.equal(normalizePhone('98200 12345'), '+919820012345');
  assert.equal(normalizePhone('+1 (415) 555-2671'), '+14155552671');
  assert.equal(normalizePhone('919820012345'), '+919820012345');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone(''), null);
});

test('FULL JOURNEY: public request -> approval -> repair stages -> return, customer is texted at every step', async () => {
  // 1. Public customer submits (no login). Invalid phone is rejected up front.
  const bad = await ctx.anon.post('/service-centre/public/requests', { title: 'x', customer_name: 'Asha Rao', customer_phone: '123' });
  assert.equal(bad.status, 422);
  const noPhone = await ctx.anon.post('/service-centre/public/requests', { title: 'x', customer_name: 'Asha Rao' });
  assert.equal(noPhone.status, 422, 'phone is required on this site');
  const made = await ctx.anon.post('/service-centre/public/requests', { title: 'Laptop will not boot', customer_name: 'Asha Rao', customer_phone: '98200 55501', device_type: 'Laptop' });
  assert.equal(made.status, 201);
  assert.equal(made.body.sms, true);
  assert.match(made.body.track_url, /\/s\/service-centre\/track\?ref=SC-\d+/);
  const rq = await findReq(made.body.label);

  let n = await msgs(rq.id);
  assert.deepEqual(n.map((x) => x.event), ['received']);
  assert.equal(n[0].to_phone, '+919820055501');
  assert.equal(n[0].status, 'sent');
  assert.equal(n[0].provider, 'log');
  assert.match(n[0].message, /Service Centre: Hi Asha, we have received your request SC-\d+/);

  // 2. Manager approves
  const appr = (await ctx.as('servicemgr').get('/service-centre/approvals')).body.find((a) => a.request_id === rq.id);
  assert.equal((await ctx.as('servicemgr').post(`/service-centre/approvals/${appr.id}/decide`, { decision: 'approve' })).status, 200);
  // 3. Technician opens the repair, moves through the pipeline
  const job = (await ctx.as('tech').post('/service-centre/repairs', { request_id: rq.id, device: 'Test laptop', fault: 'No boot' })).body;
  for (const s of ['awaiting_parts', 'repairing', 'testing', 'completed']) assert.equal((await ctx.as('tech').post(`/service-centre/repairs/${job.id}/status`, { status: s })).status, 200);
  // same status twice must NOT send a duplicate
  await ctx.as('tech').post(`/service-centre/repairs/${job.id}/status`, { status: 'completed' });
  // 4. Hand back
  assert.equal((await ctx.as('servicemgr').post('/service-centre/returns', { source_type: 'repair', repair_id: job.id, condition: 'good' })).status, 201);

  n = await msgs(rq.id);
  assert.deepEqual(n.map((x) => x.event), ['received', 'approved', 'repair_opened', 'repair_status', 'repair_status', 'repair_status', 'repair_done', 'returned']);
  assert.ok(n.every((x) => x.status === 'sent' && x.to_phone === '+919820055501'));
  assert.match(n[3].message, /waiting for a spare part/);
  assert.match(n[4].message, /repair is in progress/);
  assert.match(n[5].message, /being tested/);
  assert.match(n[6].message, /repaired and ready/);
  assert.match(n[7].message, /handed back/);

  // 5. Public tracking: needs BOTH reference and the phone number
  const track = await ctx.anon.post('/service-centre/public/track', { ref: made.body.label, phone: '9820055501' });
  assert.equal(track.status, 200);
  assert.equal(track.body.steps.at(-1).state, 'done');
  assert.ok(track.body.steps.every((s) => s.state === 'done'));
  assert.equal(track.body.messages.length, 8);
  assert.ok(!JSON.stringify(track.body).includes('9820055501'), 'tracking never echoes the phone number back');
  assert.equal((await ctx.anon.post('/service-centre/public/track', { ref: made.body.label, phone: '9820099999' })).status, 404);
  assert.equal((await ctx.anon.post('/service-centre/public/track', { ref: 'SC-9999', phone: '9820055501' })).status, 404);
  assert.equal((await ctx.anon.post('/service-centre/public/track', { ref: 'garbage', phone: '9820055501' })).status, 404);
  // a customer of another site's phone/ref cannot be tracked through a different site
  assert.equal((await ctx.anon.post('/distribution/public/track', { ref: 'DR-0001', phone: '9820055501' })).status, 404);
});

test('Rejection and cancellation texts the customer too; progress shows partway', async () => {
  const mk = async (name, phone) => {
    const r = await ctx.anon.post('/service-centre/public/requests', { title: `Job for ${name}`, customer_name: name, customer_phone: phone, device_type: 'Phone' });
    return { label: r.body.label, rq: await findReq(r.body.label) };
  };
  const a = await mk('Ravi Kumar', '9820055502');
  const q = (await ctx.as('servicemgr').get('/service-centre/approvals')).body.find((x) => x.request_id === a.rq.id);
  const rej = await ctx.as('servicemgr').post(`/service-centre/approvals/${q.id}/decide`, { decision: 'reject', comment: 'Beyond repair' });
  assert.equal(rej.body.request_status, 'rejected');
  const n = await msgs(a.rq.id);
  assert.deepEqual(n.map((x) => x.event), ['received', 'rejected']);
  assert.ok(!n[1].message.includes('Beyond repair'), 'internal reason is not sent to the customer');
  const t = (await ctx.anon.post('/service-centre/public/track', { ref: a.label, phone: '9820055502' })).body;
  assert.equal(t.steps.at(-1).bad, true);

  const b = await mk('Sita Das', '9820055503');
  assert.equal((await ctx.as('servicemgr').post(`/service-centre/requests/${b.rq.id}/cancel`)).status, 200);
  assert.deepEqual((await msgs(b.rq.id)).map((x) => x.event), ['received', 'cancelled']);

  const c = await mk('Tina Roy', '9820055504');
  const mid = (await ctx.anon.post('/service-centre/public/track', { ref: c.label, phone: '9820055504' })).body;
  assert.equal(mid.steps[0].state, 'current', 'waiting for approval: received is the current step');
  assert.equal(mid.steps[1].state, 'todo');
  assert.equal(mid.steps.at(-1).state, 'todo');
});

test('Staff: manager can send a custom update; members cannot; other sites cannot see messages', async () => {
  const rq = (await ctx.as('servicemgr').get('/service-centre/requests')).body.find((r) => r.status === 'pending');
  assert.equal((await ctx.as('tech').post(`/service-centre/requests/${rq.id}/notify`, { message: 'hello there' })).status, 403);
  assert.equal((await ctx.as('servicemgr').post(`/service-centre/requests/${rq.id}/notify`, { message: 'hi' })).status, 422);
  const ok = await ctx.as('servicemgr').post(`/service-centre/requests/${rq.id}/notify`, { message: 'Your device quote will be ready tomorrow.' });
  assert.equal(ok.status, 201);
  const last = (await msgs(rq.id)).at(-1);
  assert.equal(last.event, 'custom');
  assert.match(last.message, /^Service Centre: Your device quote/);
  // not visible from another site (RLS + route scoping)
  assert.equal((await ctx.as('dispatch').get(`/distribution/requests/${rq.id}/notifications`)).status, 404);
  assert.equal((await ctx.as('storeadmin').get(`/service-centre/requests/${rq.id}/notifications`)).status, 403);
});

test('Sites without SMS enabled send nothing', async () => {
  const item = (await ctx.as('admin').get('/distribution/components')).body[0];
  const r = await ctx.as('field').post('/distribution/requests', { title: 'No sms here', item_id: item.id, qty: 1, field_site: 'Z' });
  assert.equal(r.status, 201);
  const n = await ctx.as('dispatch').get(`/distribution/requests/${r.body.id}/notifications`);
  assert.deepEqual(n.body, []);
  assert.equal((await ctx.as('dispatch').post(`/distribution/requests/${r.body.id}/notify`, { message: 'should not send' })).status, 409);
});

test('Twilio provider: correct API call; failures never block the workflow and can be resent', async () => {
  const real = globalThis.fetch;
  const calls = [];
  let fail = true;
  globalThis.fetch = (url, init) => {
    if (String(url).startsWith('https://api.twilio.com')) {
      calls.push({ url: String(url), init });
      return Promise.resolve(fail
        ? new Response(JSON.stringify({ message: 'The number is unverified (trial account).' }), { status: 400, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ sid: 'SM123' }), { status: 201, headers: { 'content-type': 'application/json' } }));
    }
    return real(url, init);
  };
  Object.assign(process.env, { SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'secret', TWILIO_FROM: '+15005550006' });
  try {
    const made = await ctx.anon.post('/service-centre/public/requests', { title: 'Twilio test', customer_name: 'Zed', customer_phone: '9820055599', device_type: 'TV' });
    assert.equal(made.status, 201, 'request is created even though the SMS failed');
    const rq = await findReq(made.body.label);
    let n = await msgs(rq.id);
    assert.equal(n[0].status, 'failed');
    assert.match(n[0].error, /unverified/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
    assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from('ACtest:secret').toString('base64')}`);
    const form = new URLSearchParams(calls[0].init.body);
    assert.equal(form.get('To'), '+919820055599');
    assert.equal(form.get('From'), '+15005550006');
    assert.match(form.get('Body'), /Hi Zed/);

    // sending is retried manually after the problem is fixed
    fail = false;
    assert.equal((await ctx.as('tech').post(`/service-centre/requests/${rq.id}/notifications/${n[0].id}/resend`)).status, 403);
    assert.equal((await ctx.as('servicemgr').post(`/service-centre/requests/${rq.id}/notifications/${n[0].id}/resend`)).status, 200);
    n = await msgs(rq.id);
    assert.equal(n[0].status, 'sent');
    assert.equal(n[0].provider, 'twilio');
    assert.equal(n[0].attempts, 2);
    // only failed messages can be resent
    assert.equal((await ctx.as('servicemgr').post(`/service-centre/requests/${rq.id}/notifications/${n[0].id}/resend`)).status, 409);
  } finally {
    globalThis.fetch = real;
    delete process.env.SMS_PROVIDER; delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_FROM;
  }
});

test('Builder validation: SMS needs a phone field', async () => {
  const b = (await ctx.as('admin').get('/sites/service-centre/builder')).body;
  const cfg = JSON.parse(JSON.stringify(b.draft));
  cfg.modules.find((m) => m.type === 'request').config.phoneField = 'does_not_exist';
  const r = (await ctx.as('admin').put('/sites/service-centre/draft', { config: cfg })).body.validation;
  assert.ok(r.errors.some((e) => e.code === 'notify.phone_field'));
  await ctx.as('admin').put('/sites/service-centre/draft', { config: b.draft });
});
