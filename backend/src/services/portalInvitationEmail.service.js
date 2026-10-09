/**
 * Branded “You’re Invited to the Portal” HTML for guardians/clients.
 * Tenant header/footer chrome is applied by unifiedEmail finalizeOutboundContent
 * (or optionally here when headerUrl/footerUrl are passed).
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
  return '#1B5E20';
}

const FEATURES = [
  { label: 'View &amp; manage appointments', glyph: '📅' },
  { label: 'Securely message your care team', glyph: '💬' },
  { label: 'Access documents, forms, and resources', glyph: '📄' },
  { label: 'Update your profile information', glyph: '👤' },
  { label: 'Receive important notifications', glyph: '🔔' }
];

/**
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildPortalInvitationEmail(opts = {}) {
  const agencyName = String(opts.agencyName || 'Care team').trim();
  const accountAction = opts.existingAccount ? 'sign in to your account in' : 'create an account in';
  const actionLabel = opts.existingAccount ? 'Open Your Portal' : 'Create Your Portal Account';
  const providerName = String(opts.providerName || 'your provider').trim();
  const recipientFirst = String(opts.recipientFirstName || '').trim();
  const greet = recipientFirst ? `Hello ${escapeHtml(recipientFirst)},` : 'Hello,';
  const setupUrl = String(opts.setupUrl || '').trim();
  const setupDisplay = String(opts.setupDisplayUrl || setupUrl || '').trim();
  const supportUrl = String(
    opts.supportUrl || `${publicAppBaseUrl()}/support`
  ).trim();
  const primary = parsePrimaryColor(opts.colorPalette);
  const navy = '#0B1F3A';
  const soft = '#E8F2F4';

  const featureCells = FEATURES.map(
    (f) => `
    <td style="width:20%;vertical-align:top;padding:8px 6px;text-align:center;">
      <div style="width:44px;height:44px;line-height:44px;margin:0 auto 8px;border-radius:22px;border:2px solid ${navy};font-size:18px;">${f.glyph}</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.35;color:${navy};font-weight:600;">${f.label}</div>
    </td>`
  ).join('');

  const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;">
  <tr>
    <td style="padding:28px 28px 8px;">
      <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.25;font-weight:700;color:${navy};">
        You’re Invited to the ${escapeHtml(agencyName)} Portal!
      </h1>
      <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#334155;">
        ${greet}
      </p>
      <p style="margin:0 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#334155;">
        Your provider, <strong style="color:${navy};">${escapeHtml(providerName)}</strong>, has invited you to ${accountAction} the
        ${escapeHtml(agencyName)} client portal. The portal gives you a secure and convenient way to stay connected,
        access important information, and manage your care.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:0 28px 8px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;padding:0 12px 0 0;width:58%;">
            <a href="${escapeHtml(setupUrl)}"
               style="display:inline-block;background:${primary};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:10px;">
              ${actionLabel} →
            </a>
            <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#64748b;">
              Or copy and paste this link into your browser:<br/>
              <a href="${escapeHtml(setupUrl)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(setupDisplay)}</a>
            </p>
          </td>
          <td style="vertical-align:top;width:42%;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${soft};border-radius:12px;">
              <tr>
                <td style="padding:16px;">
                  <div style="width:36px;height:36px;line-height:36px;text-align:center;border-radius:18px;background:${primary};color:#fff;font-size:16px;margin-bottom:10px;">✉</div>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#334155;">
                    <strong style="color:${navy};">This invitation was sent by your provider.</strong>
                    If you were not expecting this email, you can safely ignore it or contact our support team for assistance.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 8px;">
      <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:${navy};">
        Your first task: review your notification preferences and complete text enrollment if you choose text reminders. With your portal account, you can:
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>${featureCells}</tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 28px 8px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f3f7fe;border-top:3px solid #0047b3;border-radius:12px;">
        <tr>
          <td style="padding:22px;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#536680;">
            <p style="margin:0 0 8px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#4f6684;">Your communications, connected</p>
            <h2 style="margin:0 0 10px;font-size:21px;line-height:1.3;letter-spacing:-0.4px;color:#0f2d6b;">Messaging managed by Conversa</h2>
            <p style="margin:0 0 14px;font-size:14px;">Conversa manages messaging and notifications for <strong style="color:#244a78;">${escapeHtml(agencyName)}</strong>. Your organization remains your point of contact.</p>
            <p style="margin:0;font-size:13px;">Choose your email and text preferences in your dashboard. Text messages are optional. If you choose texts, review and sign your choices; your organization reviews them before activating selected subscriptions.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:22px 28px 28px;">
      <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#334155;">
        If you have any questions or need help setting up your account, we’re here for you!
      </p>
      <a href="${escapeHtml(supportUrl)}"
         style="display:inline-block;background:#ffffff;border:1px solid #94a3b8;color:${navy};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:10px 16px;border-radius:8px;">
        Contact Support ›
      </a>
      <p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#334155;">
        We look forward to connecting with you!<br/>
        <strong style="color:${navy};">The ${escapeHtml(agencyName)} Team</strong>
      </p>
    </td>
  </tr>
</table>`.trim();

  const text = `You’re Invited to the ${agencyName} Portal!

${recipientFirst ? `Hello ${recipientFirst},` : 'Hello,'}

Your provider, ${providerName}, has invited you to ${accountAction} the ${agencyName} client portal.

${actionLabel}:
${setupUrl}

Your first task: review your notification preferences and complete text enrollment if you choose text reminders.

Messaging managed by Conversa for ${agencyName}. Your organization remains your point of contact.

Choose your email and text preferences in your dashboard. Text messages are optional. If you choose texts, review and sign your choices; your organization reviews them before activating selected subscriptions.

Questions? ${supportUrl}

The ${agencyName} Team`;

  return {
    subject: `You’re invited to the ${agencyName} portal`,
    html,
    text
  };
}

/**
 * Resolve chrome + build invite payload ready to send.
 */
export async function buildPortalInvitationEmailForAgency(agency, opts = {}) {
  const chrome = await resolveTenantEmailChrome(agency?.id || opts.agencyId).catch(() => null);
  let built = buildPortalInvitationEmail({
    ...opts,
    agencyName: opts.agencyName || agency?.name || 'Care team',
    colorPalette: opts.colorPalette || agency?.color_palette
  });
  if (chrome?.headerUrl || chrome?.footerUrl) {
    built = {
      ...built,
      html: applyTenantEmailChromeHtml(
        built.html,
        {
          headerUrl: chrome.headerUrl,
          footerUrl: chrome.footerUrl,
          agencyName: opts.agencyName || agency?.name
        },
        {
          agencyName: opts.agencyName || agency?.name,
          supportUrl: opts.supportUrl || chrome.supportUrl || `${publicAppBaseUrl()}/support`,
          replyMailto: opts.replyMailto || null,
          agencyPhone: opts.agencyPhone || agency?.phone || null,
          agencyWebsite: opts.agencyWebsite || agency?.website || null
        }
      )
    };
  }
  return built;
}

export default {
  buildPortalInvitationEmail,
  buildPortalInvitationEmailForAgency
};
