// Customer notifications (SMS).
//
// Flow: a workflow step happens -> queueSms() writes a `notifications` row INSIDE the same DB transaction
// (so a message exists if and only if the step really happened) -> after commit, flush() sends queued
// rows through the configured provider and records sent / failed. An SMS failure never blocks the workflow.
//
// Providers (env SMS_PROVIDER):
//   log       (default) prints the message to the server console and marks it sent. Perfect for demos.
//   twilio    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM  (or TWILIO_MESSAGING_SERVICE_SID)
//   fast2sms  FAST2SMS_API_KEY   (India, 10-digit numbers)
//   webhook   SMS_WEBHOOK_URL    (POSTs {to, message} as JSON; plug in MSG91 or any gateway)
import { withSite } from './db.js';
import { hasModule, moduleConfig } from '../../shared/registry.js';
import { sendEmail } from './email.js';

const CC = () => String(process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');

/** "98200 12345" -> "+919820012345". Returns null if it cannot be a real mobile number. */
export function normalizePhone(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+${CC()}${digits}`;
  if (digits.startsWith(CC()) && digits.length === CC().length + 10) return `+${digits}`;
  return `+${digits}`;
}
export const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

const TEMPLATES = {
  received: '{site}: Hi {name}, we have received your request {ref} ({title}).{link}',
  approved: '{site}: Good news {name}! Request {ref} is approved. Our technician will start on your device shortly.{link}',
  rejected: '{site}: Sorry {name}, we could not accept request {ref}. Please contact us for details.',
  cancelled: '{site}: Request {ref} has been cancelled. Contact us if this is a mistake.',
  repair_opened: '{site}: {name}, your device is with our technician now (job {job}). We are diagnosing the problem.{link}',
  repair_status: '{site}: {name}, update on {ref}: {status_text}.{link}',
  repair_done: '{site}: {name}, great news! Your device ({ref}) is repaired and ready for hand-back.{link}',
  returned: '{site}: {name}, your device has been handed back. Thank you for choosing {site}!',
  custom: '{site}: {message}',
};
const STATUS_TEXT = {
  diagnosing: 'we are diagnosing the problem', awaiting_parts: 'we are waiting for a spare part', repairing: 'the repair is in progress', testing: 'your device is being tested',
};
export const EVENT_LABEL = {
  received: 'Request received', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', repair_opened: 'Repair started',
  repair_status: 'Repair update', repair_done: 'Repair complete', returned: 'Handed back', custom: 'Message from staff',
};

export const trackLink = (config, label) => (process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/s/${config.slug}/track?ref=${encodeURIComponent(label)}` : '');

function render(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k === 'link' ? (vars.link ? ` Track: ${vars.link}` : '') : vars[k] ?? '')).replace(/\s+/g, ' ').trim();
}

/**
 * Queue one SMS inside the caller's transaction. Returns the notification row, or null when this site does
 * not send SMS / the request has no phone number.
 */
export async function queueSms(repo, config, request, event, extra = {}) {
  if (!hasModule(config, 'request')) return null;
  const cfg = moduleConfig(config, 'request');
  if (!cfg.notifyCustomer) return null;
  const rawPhone = request.data?.[cfg.phoneField];
  if (!rawPhone) return null;
  const to = normalizePhone(rawPhone);
  const label = `${cfg.numberPrefix || 'REQ'}-${String(request.req_no).padStart(4, '0')}`;
  const name = String(request.data?.customer_name || request.data?.name || 'there').trim().split(/\s+/)[0];
  const vars = { site: config.name, name, ref: label, title: request.title, link: trackLink(config, label), ...extra };
  const tpl = cfg.smsTemplates?.[event] || TEMPLATES[event] || TEMPLATES.custom;
  const message = render(tpl, vars).slice(0, 480);
  try {
    return await repo.insert('notifications', {
      request_id: request.id, event, channel: 'sms', to_phone: to || String(rawPhone), message,
      status: to ? 'queued' : 'skipped', error: to ? null : 'Not a valid mobile number', created_by: extra.actorId || null,
    });
  } catch (err) {
    console.warn('[Notifications] Could not record SMS in notifications table:', err.message);
    return null;
  }
}

export const statusText = (s) => STATUS_TEXT[s] || `status is now ${String(s).replace(/_/g, ' ')}`;

/* ------------------------------- providers ------------------------------- */
async function post(url, init) {
  const res = await fetch(url, init);
  let body = null;
  try { body = await res.json(); } catch { /* not json */ }
  return { res, body };
}

const PROVIDERS = {
  async log(to, message) {
    console.log(`[SMS:log] -> ${to}: ${message}`);
    return { provider: 'log', ref: null };
  },
  async twilio(to, message) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).');
    const form = new URLSearchParams({ To: to, Body: message });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
    else if (process.env.TWILIO_FROM) form.set('From', process.env.TWILIO_FROM);
    else throw new Error('Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID.');
    const { res, body } = await post(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
    });
    if (!res.ok) throw new Error(body?.message || `Twilio error ${res.status}`);
    return { provider: 'twilio', ref: body?.sid || null };
  },
  async fast2sms(to, message) {
    const key = process.env.FAST2SMS_API_KEY;
    if (!key) throw new Error('Fast2SMS is not configured (FAST2SMS_API_KEY).');
    const { res, body } = await post('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST', headers: { authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ route: process.env.FAST2SMS_ROUTE || 'q', message, language: 'english', flash: 0, numbers: last10(to) }),
    });
    if (!res.ok || body?.return === false) throw new Error(Array.isArray(body?.message) ? body.message.join(' ') : body?.message || `Fast2SMS error ${res.status}`);
    return { provider: 'fast2sms', ref: body?.request_id || null };
  },
  async webhook(to, message) {
    const url = process.env.SMS_WEBHOOK_URL;
    if (!url) throw new Error('SMS_WEBHOOK_URL is not set.');
    const { res } = await post(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, message }) });
    if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
    return { provider: 'webhook', ref: null };
  },
};

export const providerName = () => (PROVIDERS[process.env.SMS_PROVIDER] ? process.env.SMS_PROVIDER : 'log');

/** Send every queued notification of a site. Safe to call often: each row is claimed atomically. */
export function flush(siteId) {
  const run = async () => {
    let queued = [];
    try {
      queued = await withSite(siteId, (t) => t.rows("SELECT id FROM notifications WHERE site_id = $1 AND status = 'queued' ORDER BY id LIMIT 25", [siteId]));
    } catch {
      // Table doesn't exist or query failed - skip flush
      return;
    }
    for (const { id } of queued) {
      const n = await withSite(siteId, (t) => t.one("UPDATE notifications SET status = 'sending', attempts = attempts + 1 WHERE site_id = $1 AND id = $2 AND status = 'queued' RETURNING *", [siteId, id]));
      if (!n) continue; // someone else claimed it
      try {
        let r;
        if (n.channel === 'email') {
          const res = await sendEmail({ to: n.to_phone, subject: 'OpsHub Update: ' + (EVENT_LABEL[n.event] || 'Repair Notification'), text: n.message, html: `<p>${n.message}</p>` });
          r = { provider: res.provider || 'resend', ref: res.id || null };
        } else {
          r = await PROVIDERS[providerName()](n.to_phone, n.message);
        }
        await withSite(siteId, (t) => t.exec("UPDATE notifications SET status = 'sent', provider = $3, provider_ref = $4, error = NULL, sent_at = now() WHERE site_id = $1 AND id = $2", [siteId, id, r.provider, r.ref]));
      } catch (e) {
        await withSite(siteId, (t) => t.exec("UPDATE notifications SET status = 'failed', provider = $3, error = $4 WHERE site_id = $1 AND id = $2", [siteId, id, n.channel === 'email' ? 'resend' : providerName(), String(e.message).slice(0, 300)]));
        console.warn(`[${(n.channel || 'sms').toUpperCase()}] failed for notification ${id}: ${e.message}`);
      }
    }
  };
  if (process.env.NODE_ENV === 'test') return run();
  run().catch(() => {});
  return Promise.resolve();
}
