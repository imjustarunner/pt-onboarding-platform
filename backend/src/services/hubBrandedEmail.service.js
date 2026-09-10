/**
 * Email HTML helpers for Messages Hub.
 * Outbound hub Email uses a content fragment (no outer card) so tenant chrome
 * can wrap header → body → signature → footer as one continuous column.
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
      month: 'short',
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
  return '#669878';
}

function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function htmlToPlainPreview(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Strip signatures, chrome, and boilerplate so history shows only the message prose.
 */
export function stripEmailHistoryBody(html, text) {
  let s = String(html || '').trim();
  if (s) {
    const bodyMatch = s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) s = bodyMatch[1];

    // Prefer the dedicated latest-body marker (Hub conversation emails).
    const marked = s.match(
      /data-hub-email-latest-body=["']?1["']?[^>]*>([\s\S]*?)<\/div>/i
    );
    if (marked?.[1]) {
      return htmlToPlainPreview(marked[1]);
    }

    // Drop nested history + signature/chrome so we don't quote the whole prior email.
    s = s
      .replace(/<div[^>]*data-hub-email-history[^>]*>[\s\S]*$/i, '')
      .replace(/<!--\s*pt-staff-html-signature\s*-->[\s\S]*$/i, '')
      .replace(/<div[^>]*data-pt-staff-signature[^>]*>[\s\S]*$/i, '')
      .replace(/<div[^>]*data-pt-signature-confidential[^>]*>[\s\S]*$/i, '')
      .replace(/<!--\s*tenant-email-chrome\s*-->[\s\S]*$/i, '')
      .replace(/You can reply to this email as usual[\s\S]*?(Sent via[\s\S]*?)?/gi, '')
      .replace(/Sent via\s+[^<\n]+/gi, '')
      .replace(/Prefer fewer emails\?[\s\S]*/gi, '')
      .replace(/CONFIDENTIAL AND POTENTIALLY SENSITIVE INFORMATION![\s\S]*/gi, '');

    s = htmlToPlainPreview(s)
      .replace(/^Conversation\b/i, '')
      .replace(/Replies return to[^.]*\./gi, '')
      .replace(/Same team\.\s*A brighter tomorrow\./gi, '')
      .replace(/\bLatest message\b/gi, '')
      .replace(/Earlier in this conversation/gi, '')
      .replace(/\bOriginal message\b/gi, '')
      .replace(/\bTo:\s*[^\n]+/gi, '')
      .replace(/\bCc:\s*[^\n]+/gi, '')
      .replace(/\bSubject:\s*[^\n]+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (s) return s;
  return String(text || '')
    .replace(/You can reply to this email as usual[\s\S]*/i, '')
    .replace(/Sent via\s+.*/gi, '')
    .replace(/CONFIDENTIAL AND POTENTIALLY SENSITIVE INFORMATION![\s\S]*/gi, '')
    .trim();
}

function truncatePreview(text, max = 160) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trim()}…`;
}

/**
 * Greyed prior messages for Hub outbound email (email-safe tables).
 * @param {Array<{ authorName?: string, createdAt?: any, bodyText?: string, direction?: string, isOriginal?: boolean }>} history
 */
export function buildHubConversationHistoryHtml(history = [], opts = {}) {
  const items = Array.isArray(history) ? history.filter(Boolean).slice(0, 12) : [];
  if (!items.length) return '';
  const primary = escapeHtml(parsePrimaryColor(opts.colorPalette));

  const rows = items
    .map((h, idx) => {
      const name = escapeHtml(h.authorName || (h.direction === 'outbound' ? 'Team' : 'Participant'));
      const when = escapeHtml(formatWhen(h.createdAt));
      const preview = escapeHtml(truncatePreview(h.bodyText || '', h.isOriginal ? 220 : 280));
      const isOriginal = !!h.isOriginal || idx === items.length - 1;
      const badge = isOriginal
        ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#e2e8f0;color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.02em;vertical-align:middle;">Original message</span>`
        : '';
      return `
      <tr>
        <td style="padding:0 0 12px;vertical-align:top;">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;">
            <div style="font-size:15px;font-weight:700;color:#334155;">
              ${name}${badge}
            </div>
            <div style="font-size:12px;color:#64748b;margin:3px 0 10px;">${when}</div>
            <div style="font-size:15px;line-height:1.55;color:#475569;">${preview}</div>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  return `
  <div data-hub-email-history="1" style="margin:18px 0 0;padding-top:4px;border-top:1px solid #eef2f6;">
    <div style="font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin:0 0 12px;">Earlier in this conversation</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      ${rows}
    </table>
    <div style="font-size:0;line-height:0;color:${primary};">.</div>
  </div>`;
}

/**
 * Hub outbound message body fragment (no DOCTYPE / outer gray frame).
 * Latest message + optional greyed history; staff signature is appended later.
 */
export function buildNormalOutboundEmailHtml(opts = {}) {
  const sender = escapeHtml(opts.senderDisplayName || 'Team member');
  const agencyName = escapeHtml(opts.agencyName || '');
  const subject = escapeHtml(opts.subject || '');
  const toLabel = escapeHtml(opts.toDisplayName || opts.toEmail || '');
  const ccLabel = escapeHtml(formatRecipientList(opts.ccList || opts.cc || []));
  const rawHtml = String(opts.bodyHtml || '').trim();
  const body = rawHtml
    ? rawHtml.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    : escapeHtml(opts.bodyText || '').replace(/\n/g, '<br/>');
  const primary = escapeHtml(parsePrimaryColor(opts.colorPalette));
  const photoUrl = String(opts.senderPhotoUrl || '').trim();
  const when = escapeHtml(formatWhen(opts.sentAt || new Date()));
  const historyHtml = buildHubConversationHistoryHtml(opts.history || [], {
    colorPalette: opts.colorPalette
  });
  const initials = escapeHtml(initialsFromName(opts.senderDisplayName || 'Team'));
  const avatar = photoUrl
    ? `<img src="${escapeHtml(photoUrl)}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border-radius:18px;object-fit:cover;border:0;" />`
    : `<div style="width:36px;height:36px;border-radius:18px;background:${primary};color:#ffffff;font-size:12px;font-weight:700;line-height:36px;text-align:center;">${initials}</div>`;

  const metaBits = [
    toLabel ? `<div style="margin:0 0 2px;"><span style="color:#64748b;">To:</span> ${toLabel}</div>` : '',
    ccLabel ? `<div style="margin:0 0 2px;"><span style="color:#64748b;">Cc:</span> ${ccLabel}</div>` : '',
    subject ? `<div style="margin:0;"><span style="color:#64748b;">Subject:</span> ${subject}</div>` : ''
  ]
    .filter(Boolean)
    .join('');

  return `<div data-hub-email-body="1" style="padding:4px 0 8px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 12px;">
    <tr>
      <td style="vertical-align:middle;">
        <div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">${sender}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">Replies return to ${agencyName || 'your care team'} — not a personal staff inbox.</div>
      </td>
      <td align="right" style="vertical-align:middle;font-size:10px;font-weight:800;letter-spacing:0.04em;color:${primary};text-transform:uppercase;white-space:nowrap;">
        Same team. A brighter tomorrow.
      </td>
    </tr>
  </table>

  <div style="background:#f3faf5;border:1px solid ${primary};border-radius:14px;padding:16px 18px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 10px;">
      <tr>
        <td width="44" style="width:44px;vertical-align:middle;padding:0 10px 0 0;">
          ${avatar}
        </td>
        <td style="vertical-align:middle;">
          <div style="font-size:16px;font-weight:800;color:#0f172a;line-height:1.3;">
            ${sender}
            <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:${primary};color:#ffffff;font-size:10px;font-weight:700;letter-spacing:0.02em;vertical-align:middle;">Latest message</span>
          </div>
          <div style="font-size:12px;color:#64748b;margin-top:3px;">${when}</div>
        </td>
      </tr>
    </table>
    ${metaBits ? `<div style="font-size:13px;color:#475569;margin:0 0 12px;line-height:1.45;">${metaBits}</div>` : ''}
    <div data-hub-email-latest-body="1" style="color:#0f172a;font-size:17px;line-height:1.65;">${body}</div>
  </div>

  ${historyHtml}
</div>`;
}

function formatRecipientList(list) {
  if (!list) return '';
  let items = [];
  if (typeof list === 'string') {
    items = list
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(list)) {
    items = list
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item.trim();
        const name = String(item.name || item.displayName || '').trim();
        const email = String(item.email || '').trim();
        if (name && email) return `${name} <${email}>`;
        return name || email;
      })
      .filter(Boolean);
  }
  return items.join(', ');
}

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
