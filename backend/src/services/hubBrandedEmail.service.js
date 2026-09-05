/**
 * Email HTML helpers for Messages Hub.
 * - Normal outbound: ordinary email look (no “secure” language).
 * - Branded: digests / secure notify only.
 * Never includes personal/SSO addresses of staff in visible headers/body.
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

/**
 * Normal outbound email (hub Email channel). Looks like ordinary mail.
 */
export function buildNormalOutboundEmailHtml(opts = {}) {
  const sender = escapeHtml(opts.senderDisplayName || 'Team member');
  const title = escapeHtml(opts.senderTitle || '');
  const agencyName = escapeHtml(opts.agencyName || '');
  const body = escapeHtml(opts.bodyText || '').replace(/\n/g, '<br/>');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;font-size:15px;line-height:1.55;">
  <div style="margin-bottom:12px;color:#64748b;font-size:13px;">
    ${sender}${title ? ` · ${title}` : ''}${agencyName ? ` · ${agencyName}` : ''}
  </div>
  <div>${body}</div>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px;">You can reply to this email as usual.</p>
</body></html>`;
}

/**
 * Branded template for unread digests / secure notify (not everyday hub Email).
 */
export function buildBrandedMessageEmailHtml(opts = {}) {
  const agencyName = escapeHtml(opts.agencyName || 'Your care team');
  const location = escapeHtml(opts.agencyLocation || '');
  const sender = escapeHtml(opts.senderDisplayName || 'Team member');
  const title = escapeHtml(opts.senderTitle || '');
  const body = escapeHtml(opts.bodyText || '').replace(/\n/g, '<br/>');
  const appUrl = escapeHtml(opts.appUrl || '');
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

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#0f766e;color:#fff;padding:18px 22px;">
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
              ? `<p style="margin:0 0 18px;"><a href="${appUrl}" style="color:#0f766e;font-weight:700;">Open in Messages</a></p>`
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

export function buildLikedMessageEmailHtml({ agencyName, actorName, preview, appUrl }) {
  return buildBrandedMessageEmailHtml({
    agencyName,
    senderDisplayName: actorName || 'Someone',
    bodyText: `${actorName || 'Someone'} liked your message${preview ? `:\n\n“${String(preview).slice(0, 200)}”` : '.'}`,
    appUrl,
    footerNote: 'You are receiving this because someone reacted to a message in the app.'
  });
}
