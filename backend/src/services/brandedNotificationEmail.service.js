/**
 * Branded HTML for contact reminder assignment emails.
 * Tenant header/footer chrome is applied by unifiedEmail finalizeOutboundContent
 * (and optionally here when headerUrl/footerUrl are passed).
 */
import { publicAppBaseUrl } from './contactReminderToken.service.js';
import {
  applyTenantEmailChromeHtml,
  resolveTenantEmailChrome
} from './tenantEmailChrome.service.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parsePrimaryColor(colorPalette) {
  try {
    const p = typeof colorPalette === 'string' ? JSON.parse(colorPalette || '{}') : colorPalette || {};
    const c = String(p.primary || p.primaryColor || '').trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
  } catch {
    /* ignore */
  }
  return '#1f6b4a';
}

function clientInitials(firstName, lastName, preferredName) {
  const a = String(preferredName || firstName || '').trim();
  const b = String(lastName || '').trim();
  const i1 = a ? a[0] : '';
  const i2 = b ? b[0] : a.length > 1 ? a[1] : '';
  return `${i1}${i2}`.toUpperCase() || '?';
}

export function buildContactAssignedReminderEmail(opts = {}) {
  const agencyName = String(opts.agencyName || 'Care team').trim();
  const assignerName = String(opts.assignerName || 'A team member').trim();
  const contactName = String(opts.contactName || '').trim();
  const greet = contactName ? `Hello ${contactName.split(/\s+/)[0]},` : 'Hello,';
  const initials = clientInitials(opts.clientFirstName, opts.clientLastName, opts.clientPreferredName);
  const emailOn = !!opts.emailRemindersEnabled;
  const smsOn = !!opts.smsRemindersEnabled;
  const notificationsEmail = String(opts.notificationsEmail || 'notifications@itsco.health').trim();
  const links = opts.links || {};

  const statusBits = [];
  if (emailOn && smsOn) statusBits.push('email and text');
  else if (emailOn) statusBits.push('email');
  else if (smsOn) statusBits.push('text');
  const statusPhrase = statusBits.length
    ? `on for ${statusBits.join(' and ')} appointment reminders`
    : 'not currently receiving appointment reminders';

  const headline = `You've been added as a contact for ${initials}.`;
  const explainer = `${escapeHtml(assignerName)} added you as a contact for ${escapeHtml(initials)} through the ${escapeHtml(agencyName)} portal and selected you to receive appointment reminders on behalf of this client.`;

  const actionButtons = [];
  if (emailOn && smsOn) {
    actionButtons.push({ label: 'Change to Text Only', href: links.smsOnly });
    actionButtons.push({ label: 'Change to Email Only', href: links.emailOnly });
    actionButtons.push({ label: 'Turn Off Reminders', href: links.off });
  } else if (emailOn && !smsOn) {
    actionButtons.push({ label: 'Change to Text Only', href: links.smsOnly });
    actionButtons.push({ label: 'Turn On Email &amp; Text', href: links.both });
    actionButtons.push({ label: 'Turn Off Reminders', href: links.off });
  } else if (!emailOn && smsOn) {
    actionButtons.push({ label: 'Change to Email Only', href: links.emailOnly });
    actionButtons.push({ label: 'Turn On Email &amp; Text', href: links.both });
    actionButtons.push({ label: 'Turn Off Reminders', href: links.off });
  } else {
    actionButtons.push({ label: 'Turn On Email Only', href: links.emailOnly });
    actionButtons.push({ label: 'Turn On Text Only', href: links.smsOnly });
    actionButtons.push({ label: 'Turn On Email &amp; Text', href: links.both });
  }

  const buttonRows = actionButtons
    .filter((b) => b.href)
    .map(
      (b) => `
      <tr>
        <td style="padding:0 0 10px;">
          <a href="${escapeHtml(b.href)}" style="display:block;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:14px 16px;text-decoration:none;color:#0f172a;font-size:15px;font-weight:600;">
            ${b.label} <span style="float:right;color:#94a3b8;">›</span>
          </a>
        </td>
      </tr>`
    )
    .join('');

  let html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
  <tr><td style="padding:28px 28px 8px;">
    <p style="margin:0 0 10px;font-size:18px;font-weight:700;color:#1f6b4a;">${escapeHtml(greet)}</p>
    <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;font-weight:800;color:#0e7490;">${escapeHtml(headline)}</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#334155;">${explainer}</p>
  </td></tr>
  <tr><td style="padding:0 28px 22px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8eef5;border-radius:14px;">
      <tr>
        <td style="padding:18px 16px;width:42%;vertical-align:middle;">
          <table role="presentation" cellspacing="0" cellpadding="0">
            <tr>
              <td style="width:48px;height:48px;border-radius:24px;background:#0e7490;color:#fff;text-align:center;font-weight:800;font-size:16px;line-height:48px;">${escapeHtml(initials)}</td>
              <td style="padding-left:10px;font-size:12px;font-weight:700;letter-spacing:0.04em;color:#64748b;">CLIENT ${escapeHtml(initials)}</td>
            </tr>
          </table>
        </td>
        <td style="padding:18px 16px;vertical-align:middle;">
          <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#64748b;margin:0 0 8px;">YOUR CURRENT APPOINTMENT REMINDER SETTINGS</div>
          <div style="font-size:14px;color:#0f172a;margin:0 0 6px;">Email reminders: <strong style="color:${emailOn ? '#15803d' : '#94a3b8'};">${emailOn ? 'ON' : 'OFF'}</strong></div>
          <div style="font-size:14px;color:#0f172a;">Text reminders: <strong style="color:${smsOn ? '#15803d' : '#94a3b8'};">${smsOn ? 'ON' : 'OFF'}</strong></div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:4px 28px 8px;">
    <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1f6b4a;">Would you like to change this?</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#64748b;">If you'd like to update your notification preferences, choose an option below. Your selection will be saved automatically.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${buttonRows}</table>
  </td></tr>
  <tr><td style="padding:18px 28px 28px;">
    <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#64748b;">You can update these preferences at any time through the links in our emails or by contacting our support team.</p>
    <p style="margin:0;font-size:15px;color:#1f6b4a;">Thank you,<br/><strong>The ${escapeHtml(agencyName)} Team</strong></p>
  </td></tr>
</table>`;

  if (opts.headerUrl || opts.footerUrl) {
    html = applyTenantEmailChromeHtml(
      html,
      { headerUrl: opts.headerUrl, footerUrl: opts.footerUrl, agencyName },
      {
        agencyName,
        replyMailto: notificationsEmail,
        supportUrl: opts.supportUrl || `${publicAppBaseUrl()}/support`,
        unsubscribeUrl: opts.unsubscribeUrl || links.off,
        agencyPhone: opts.agencyPhone,
        agencyWebsite: opts.agencyWebsite
      }
    );
  }

  const text = `${greet}

${headline}

${assignerName} added you as a contact for ${initials} through the ${agencyName} portal. You are ${statusPhrase} for ${initials}.

Email reminders: ${emailOn ? 'ON' : 'OFF'}
Text reminders: ${smsOn ? 'ON' : 'OFF'}

Update preferences:
${actionButtons.map((b) => `- ${String(b.label).replace(/&amp;/g, '&')}: ${b.href}`).join('\n')}

Reply to ${notificationsEmail}

Thank you,
The ${agencyName} Team`;

  return { subject: `You've been added as a contact for ${initials}`, html, text };
}

export async function buildContactAssignedReminderEmailForAgency(opts = {}) {
  const chrome = opts.agencyId ? await resolveTenantEmailChrome(opts.agencyId) : null;
  return buildContactAssignedReminderEmail({
    ...opts,
    headerUrl: chrome?.headerUrl || opts.headerUrl,
    footerUrl: chrome?.footerUrl || opts.footerUrl
  });
}

export function buildContactReminderPrefResultHtml(opts = {}) {
  const agencyName = escapeHtml(opts.agencyName || 'Care team');
  const message = escapeHtml(opts.message || 'Your preferences have been updated.');
  const primary = escapeHtml(parsePrimaryColor(opts.colorPalette));
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Preferences updated</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;">
  <div style="max-width:480px;margin:48px auto;padding:28px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;">
    <div style="height:6px;background:${primary};border-radius:4px;margin:0 0 18px;"></div>
    <h1 style="margin:0 0 10px;font-size:22px;color:#0f172a;">Preferences saved</h1>
    <p style="margin:0 0 18px;color:#475569;line-height:1.5;">${message}</p>
    <p style="margin:0;color:#94a3b8;font-size:13px;">— ${agencyName}</p>
  </div>
</body></html>`;
}
