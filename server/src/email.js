import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolves RESEND_API_KEY from process.env or looks in .env files in common paths.
 */
export function getResendApiKey() {
  if (process.env.RESEND_API_KEY !== undefined) {
    return process.env.RESEND_API_KEY.trim() || null;
  }

  // Fallback: check .env files if not loaded into process.env yet
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'server', '.env'),
    path.resolve(process.cwd(), '..', '.env'),
  ];

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const text = fs.readFileSync(file, 'utf8');
        const match = text.match(/^\s*RESEND_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/m);
        if (match && match[1]) {
          const key = match[1].trim();
          process.env.RESEND_API_KEY = key;
          return key;
        }
      }
    } catch {
      // ignore read errors
    }
  }

  return null;
}

/**
 * Resolves sender email address for Resend.
 * Defaults to 'OpsHub <onboarding@resend.dev>' which works on Resend free/test accounts.
 */
export function getResendFrom() {
  if (process.env.RESEND_FROM && process.env.RESEND_FROM.trim()) {
    return process.env.RESEND_FROM.trim();
  }
  return 'OpsHub <onboarding@resend.dev>';
}

let cachedSandboxOwner = process.env.RESEND_TEST_EMAIL || 'rishidembla07@gmail.com';

/**
 * Low-level email sender using the official Resend REST API (https://api.resend.com/emails).
 * If no API key is provided yet, logs the email details so local testing/development works gracefully.
 */
export async function sendEmail({ to, subject, html, text, from = getResendFrom() }) {
  const apiKey = getResendApiKey();
  let recipients = (Array.isArray(to) ? to : [to]).filter(Boolean).map((s) => String(s).trim());

  if (!recipients.length) {
    throw new Error('No recipient email address provided.');
  }

  if (!apiKey) {
    console.log(`[Resend:Demo] RESEND_API_KEY is not set in .env. Email simulated:`);
    console.log(`  To:      ${recipients.join(', ')}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Preview: ${(text || html).slice(0, 140).replace(/\s+/g, ' ')}...`);
    return { id: `sim_${Date.now()}`, simulated: true, provider: 'resend:simulated' };
  }

  // When using Resend's free test domain (onboarding@resend.dev), Resend strictly requires
  // delivering only to the verified account email. Routing directly prevents the 403 errors in Resend's dashboard.
  let isRedirected = false;
  if (process.env.NODE_ENV !== 'test' && from.includes('resend.dev') && cachedSandboxOwner && !recipients.includes(cachedSandboxOwner)) {
    console.log(`[Resend:TestSandbox] Delivering directly to account owner (${cachedSandboxOwner}) to prevent Resend 403.`);
    recipients = [cachedSandboxOwner];
    isRedirected = true;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html,
      text,
    }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // response not json
  }

  if (!res.ok) {
    const errorMsg = data?.message || data?.error || `Resend API returned status ${res.status}`;
    // Check if Resend testing restriction: "You can only send testing emails to your own email address (email@...)"
    const testMatch = String(errorMsg).match(/only send testing emails to your own email address \(([^)]+)\)/i);
    if (testMatch && testMatch[1]) {
      const allowedEmail = testMatch[1].trim();
      cachedSandboxOwner = allowedEmail;
      console.log(`[Resend:TestSandbox] Delivering to account owner (${allowedEmail}) because domain is not yet verified.`);
      try {
        const retryRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [allowedEmail],
            subject,
            html,
            text,
          }),
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json().catch(() => ({}));
          return { id: retryData?.id || `resend_${Date.now()}`, simulated: false, provider: 'resend', redirectedTo: allowedEmail };
        }
      } catch (retryErr) {
        console.warn('[Resend:TestSandbox] Retry to verified email failed:', retryErr.message);
      }
    }
    throw new Error(errorMsg);
  }

  return { id: data?.id || `resend_${Date.now()}`, simulated: false, provider: 'resend', ...(isRedirected ? { redirectedTo: cachedSandboxOwner } : {}) };
}

/**
 * Builds and sends a high-priority repair completion collection notification email to the customer.
 */
export async function sendRepairCompleteEmail({
  to,
  customerName = 'Customer',
  device = 'Your device',
  ref = 'REF',
  job = 'JOB',
  title = '',
  siteName = 'Service Centre',
  trackingUrl = '',
  totalCost = null,
}) {
  if (!to) return null;

  const subject = `Repair Complete: ${device} is ready for collection (${ref}) - ${siteName}`;

  const costFormatted = totalCost != null && Number(totalCost) > 0
    ? `$${Number(totalCost).toFixed(2)}`
    : null;

  const costHtmlRow = costFormatted
    ? `<tr>
         <td style="padding: 10px 14px; font-weight: 600; color: #475569; border-bottom: 1px solid #E2E8F0; width: 36%;">Total Amount:</td>
         <td style="padding: 10px 14px; color: #0D1621; font-weight: 700; border-bottom: 1px solid #E2E8F0;">${costFormatted}</td>
       </tr>`
    : '';

  const trackButton = trackingUrl
    ? `<div style="text-align: center; margin: 30px 0 16px;">
        <a href="${trackingUrl}" style="background-color: #FFDD0A; color: #0D1621; padding: 13px 30px; text-decoration: none; font-weight: 800; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; border-radius: 6px; display: inline-block; border: 1px solid #EAB308;">Track Request Online</a>
       </div>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #F4F1E8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0D1621; line-height: 1.5;">
  <div style="max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #D9D4C3; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
    <!-- Header Plate -->
    <div style="background-color: #0D1621; padding: 26px 24px; text-align: center;">
      <h1 style="margin: 0; color: #FFFFFF; font-size: 24px; font-weight: 900; letter-spacing: 1.5px;">OPS<span style="color: #FFDD0A;">HUB</span></h1>
      <p style="margin: 6px 0 0; color: #94A3B8; font-size: 11px; letter-spacing: 2.5px; font-family: monospace;">${siteName.toUpperCase()} · REPAIR SERVICES</p>
    </div>

    <!-- Main Content -->
    <div style="padding: 32px 28px;">
      <h2 style="margin: 0 0 14px; color: #0D1621; font-size: 21px; font-weight: 800;">Your Repair is Complete!</h2>
      <p style="margin: 0 0 16px; font-size: 15px; color: #334155;">Hi <strong>${customerName}</strong>,</p>
      <p style="margin: 0 0 20px; font-size: 15px; color: #334155;">
        Great news! The repair work on your <strong>${device}</strong> has been completed successfully by our technician.
      </p>

      <!-- Action Box -->
      <div style="background-color: #FEF9C3; border-left: 4px solid #EAB308; padding: 16px 20px; border-radius: 6px; margin-bottom: 26px;">
        <p style="margin: 0; font-size: 15px; font-weight: 700; color: #854D0E;">
          Please visit our service centre to collect your device.
        </p>
        <p style="margin: 4px 0 0; font-size: 13px; color: #A16207;">
          Kindly present your reference number (<strong style="font-family: monospace;">${ref}</strong>) at the counter.
        </p>
      </div>

      <!-- Job Summary Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
        <tbody>
          <tr>
            <td style="padding: 10px 14px; font-weight: 600; color: #475569; border-bottom: 1px solid #E2E8F0; width: 36%;">Reference:</td>
            <td style="padding: 10px 14px; color: #0D1621; border-bottom: 1px solid #E2E8F0; font-family: monospace; font-weight: 700;">${ref}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; font-weight: 600; color: #475569; border-bottom: 1px solid #E2E8F0;">Repair Job:</td>
            <td style="padding: 10px 14px; color: #0D1621; border-bottom: 1px solid #E2E8F0; font-family: monospace;">${job}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; font-weight: 600; color: #475569; border-bottom: 1px solid #E2E8F0;">Device:</td>
            <td style="padding: 10px 14px; color: #0D1621; border-bottom: 1px solid #E2E8F0; font-weight: 600;">${device}</td>
          </tr>
          ${title ? `<tr><td style="padding: 10px 14px; font-weight: 600; color: #475569; border-bottom: 1px solid #E2E8F0;">Reported Problem:</td><td style="padding: 10px 14px; color: #0D1621; border-bottom: 1px solid #E2E8F0;">${title}</td></tr>` : ''}
          ${costHtmlRow}
        </tbody>
      </table>

      ${trackButton}

      <p style="margin: 24px 0 0; font-size: 13.5px; color: #64748B;">
        Thank you for choosing <strong>${siteName}</strong>. If you have any questions or need special collection arrangements, feel free to contact us.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #F8FAFC; padding: 16px 24px; text-align: center; border-top: 1px solid #E2E8F0;">
      <p style="margin: 0; font-size: 12px; color: #94A3B8;">
        This automated notification was delivered by ${siteName} via OpsHub.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hi ${customerName},

Great news! The repair work on your ${device} (${ref}) has been completed successfully.

Please visit our service centre to collect your device.
Reference: ${ref}
Repair Job: ${job}
Device: ${device}
${title ? `Reported Problem: ${title}\n` : ''}${costFormatted ? `Total Amount: ${costFormatted}\n` : ''}
${trackingUrl ? `Track online: ${trackingUrl}\n` : ''}
Thank you for choosing ${siteName}!
  `.trim();

  return sendEmail({ to, subject, html, text });
}
