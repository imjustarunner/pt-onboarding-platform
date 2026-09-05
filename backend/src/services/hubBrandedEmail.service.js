/**
 * Email HTML helpers for Messages Hub.
 * Outbound hub Email uses tenant branding (logo + primary color).
 * Digests / secure notify use the heavier branded template.
 */

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWhen(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function parsePrimaryColor(colorPalette) {
  try {
    const p = typeof colorPalette === 'string' ? JSON.parse(colorPalette || '{}') : colorPalette || {};
    const c = String(p.primary || p.primaryColor || '').trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
  } catch {
    /* ignore */
  }
  return '#0f766e';
}

/**
 * Professional tenant-branded outbound email (hub Email channel).
 */
export function buildNormalOutboundEmailHtml(opts = {}) {
  const sender = escapeHtml(opts.senderDisplayName || 'Team member');
  const title = escapeHtml(opts.senderTitle || '');
  const agencyName = escapeHtml(opts.agencyName || '');
  const body = escapeHtml(opts.bodyText || '').replace(/\n/g, '<br/>');
  const primary = escapeHtml(parsePrimaryColor(opts.colorPalette));
  const logoUrl = String(opts.logoUrl || '').trim();
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${agencyName}" style="max-height:48px;max-width:200px;display:block;margin:0 0 14px;" />`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="height:6px;background:${primary};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:22px 24px 8px;">
          ${logo}
          ${agencyName ? `<div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;margin:0 0 4px;">${agencyName}</div>` : ''}
          <div style="color:#64748b;font-size:13px;margin:0 0 18px;">
            ${sender}${title ? ` · ${title}` : ''}
          </div>
          <div style="color:#1e293b;font-size:15px;line-height:1.6;">${body}</div>
          <p style="color:#94a3b8;font-size:12px;margin:22px 0 0;line-height:1.45;">
            You can reply to this email as usual. Replies return to ${agencyName || 'your care team'} — not a personal staff inbox.
          </p>
        </td></tr>
        <tr><td style="padding:14px 24px 20px;border-top:1px solid #f1f5f9;">
          <div style="font-size:11px;color:#94a3b8;">Sent via ${agencyName || 'Messages'}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Branded template for unread digests / secure notify.
 */
export function buildBrandedMessageEmailHtml(opts = {}) {
  const agencyName = escapeHtml(opts.agencyName || 'Your care team');
  const location = escapeHtml(opts.agencyLocation || '');
  const sender = escapeHtml(opts.senderDisplayName || 'Team member');
  const title = escapeHtml(opts.senderTitle || '');
  const body = escapeHtml(opts.bodyText || '').replace(/\n/g, '<br/>');
  const appUrl = escapeHtml(opts.appUrl || '');
  const primary = escapeHtml(parsePrimaryColor(opts.colorPalette));
  const logoUrl = String(opts.logoUrl || '').trim();
  const footerNote = escapeHtml(
    opts.footerNote ||
      'To respond, reply to this email or open Messages in the app. Personal email addresses are never shared.'
  );

  const history = Array.isArray(opts.history) ? opts.history.slice(-12) : [];
  const historyBlocks = history
    .map((h) => {
      const name = escapeHtml(h.authorName || 'Participant');
      const when = escapeHtml(formatWhen(h.createdAt));
      const text = escapeHtml(h.body || '').replace(/\n/g, '<br/>');
      const isOut = String(h.direction || '') === 'outbound';
      return `
        <div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:${isOut ? '#eef6f1' : '#f1f5f9'};border:1px solid #e2e8f0;">
          <div style="font-weight:700;color:#0f172a;font-size:14px;">${name}${title && isOut ? ` · ${title}` : ''}</div>
          <div style="color:#64748b;font-size:12px;margin:2px 0 8px;">${when}</div>
          <div style="color:#1e293b;font-size:14px;line-height:1.5;">${text}</div>
        </div>`;
    })
    .join('');

  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="" style="max-height:40px;max-width:180px;display:block;margin:0 0 10px;" />`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:${primary};color:#fff;padding:18px 22px;">
          ${logo}
          <div style="font-size:18px;font-weight:800;letter-spacing:-0.02em;">${agencyName}</div>
          ${location ? `<div style="opacity:0.9;font-size:13px;margin-top:4px;">${location}</div>` : ''}
        </td></tr>
        <tr><td style="padding:22px;">
          <div style="font-weight:700;color:#0f172a;font-size:15px;margin-bottom:4px;">${sender}${agencyName ? ` @ ${agencyName}` : ''}${location ? `, ${location}` : ''}</div>
          ${title ? `<div style="color:#64748b;font-size:13px;margin-bottom:14px;">${title}</div>` : '<div style="height:10px"></div>'}
          <div style="color:#1e293b;font-size:15px;line-height:1.55;margin-bottom:18px;">${body}</div>
          <div style="color:#64748b;font-size:12px;margin-bottom:8px;">Sent through ${agencyName}</div>
          ${
            appUrl
              ? `<p style="margin:0 0 18px;"><a href="${appUrl}" style="color:${primary};font-weight:700;">Open in Messages</a></p>`
              : ''
          }
          ${
            historyBlocks
              ? `<div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:8px;">
                   <div style="font-weight:800;color:#0f172a;font-size:14px;margin-bottom:12px;">Message History</div>
                   ${historyBlocks}
                 </div>`
              : ''
          }
          <p style="color:#94a3b8;font-size:12px;line-height:1.45;margin:20px 0 0;">${footerNote}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function buildLikedMessageEmailHtml({ agencyName, actorName, preview, appUrl, colorPalette, logoUrl }) {
  return buildBrandedMessageEmailHtml({
    agencyName,
    senderDisplayName: actorName || 'Someone',
    bodyText: `${actorName || 'Someone'} liked your message${preview ? `:\n\n“${String(preview).slice(0, 200)}”` : '.'}`,
    appUrl,
    colorPalette,
    logoUrl,
    footerNote: 'You are receiving this because someone reacted to a message in the app.'
  });
}
