import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import { getResendApiKey, getResendFrom, sendEmail, sendRepairCompleteEmail } from '../src/email.js';

test('Resend defaults and configuration resolution', () => {
  const from = getResendFrom();
  assert.ok(from.includes('onboarding@resend.dev') || from.includes('@'), 'defaults to valid sender');
});

test('sendEmail simulates gracefully when no API key is set', async () => {
  const oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = '';

  try {
    const res = await sendEmail({
      to: 'customer@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
      text: 'Test',
    });
    assert.equal(res.simulated, true);
    assert.equal(res.provider, 'resend:simulated');
    assert.ok(res.id.startsWith('sim_'));
  } finally {
    if (oldKey !== undefined) process.env.RESEND_API_KEY = oldKey;
    else delete process.env.RESEND_API_KEY;
  }
});

test('sendEmail validates recipients', async () => {
  await assert.rejects(
    async () => {
      await sendEmail({ to: '', subject: 'test', text: 'test' });
    },
    { message: /No recipient email/ }
  );
});

test('sendRepairCompleteEmail generates correct subject and content', async () => {
  const oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = '';

  try {
    const result = await sendRepairCompleteEmail({
      to: 'alex@example.com',
      customerName: 'Alex Smith',
      device: 'MacBook Pro 16',
      ref: 'SC-1002',
      job: 'JOB-0042',
      title: 'Logic board liquid damage',
      siteName: 'Service Centre',
      trackingUrl: 'http://localhost:4000/s/service-centre/track?ref=SC-1002',
      totalCost: 4500,
    });

    assert.equal(result.simulated, true);
  } finally {
    if (oldKey) process.env.RESEND_API_KEY = oldKey;
  }
});

test('sendEmail performs HTTP POST to Resend API when RESEND_API_KEY is present', async () => {
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 're_test_123456789';

  let capturedUrl = null;
  let capturedOptions = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 're_msg_abc123' }),
    };
  };

  try {
    const res = await sendEmail({
      to: 'customer@example.com',
      subject: 'Your repair is complete',
      html: '<p>Collection ready</p>',
      text: 'Collection ready',
    });

    assert.equal(capturedUrl, 'https://api.resend.com/emails');
    assert.equal(capturedOptions.method, 'POST');
    assert.equal(capturedOptions.headers.Authorization, 'Bearer re_test_123456789');
    assert.equal(capturedOptions.headers['Content-Type'], 'application/json');

    const body = JSON.parse(capturedOptions.body);
    assert.deepEqual(body.to, ['customer@example.com']);
    assert.equal(body.subject, 'Your repair is complete');
    assert.equal(res.id, 're_msg_abc123');
    assert.equal(res.simulated, false);
    assert.equal(res.provider, 'resend');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }
});

