/**
 * Tenant HTML email header/footer chrome.
 * Assets live under /email-branding/{slug}/ or any absolute URL stored on agency_email_settings.
 */
import pool from '../config/database.js';
import { publicAppBaseUrl } from './contactReminderToken.service.js';

const ITSCO_HEADER = '/email-branding/itsco/email-header.png';
const ITSCO_FOOTER = '/email-branding/itsco/email-footer.png';

const LLM_HEADER_PROMPT = `Create a wide HTML-email header banner (≈1200×280 px, PNG) for a behavioral-health / family-care organization.

Layout (left → right):
1) Dark/black left panel with the company logo lockup (wordmark + small family/people icon mark).
2) Short italic tagline under or beside the logo (e.g. “Connected care for families.”) with a thin lime accent underline.
3) Soft scenic transition (evergreen forest + snow-capped mountains, warm dawn light) blending into the right side.
4) Right side: large white curved panel with a teal→lime wave edge; stacked uppercase motto lines (4 short words/phrases).

Style: modern, warm, professional — not corporate purple gradients. Colors: deep green, teal, lime accents, black, white. Flat enough for email (no tiny text). Export PNG with no UI chrome.`;

const LLM_FOOTER_PROMPT = `Create a wide HTML-email footer banner (≈1200×220 px, PNG) matching the header brand.

Layout:
1) Top: fluid wavy band (teal → lime) over a deep forest-green field.
2) Left: white logo lockup (same brand as header) on the green field.
3) Center: leave a clear empty “safe zone” (≈40% width) for overlaid text links in the email HTML (Support · Reply · Unsubscribe). Do not place tiny unreadable text there.
4) Right: simple white line-art mountain mark + short stacked uppercase slogan (2–3 lines).

Style: matches the header (dark green, lime/teal accents). Flat PNG suitable for email. No real social icons required — leave space for future icons.`;

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absolutizeAssetUrl(pathOrUrl) {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = publicAppBaseUrl();
  if (raw.startsWith('/')) return `${base}${raw}`;
  return `${base}/${raw.replace(/^\/+/, '')}`;
}

function looksLikeItsco(agency = {}) {
  const hay = `${agency.name || ''} ${agency.slug || ''} ${agency.official_name || ''}`.toLowerCase();
  return hay.includes('itsco');
}

/**
 * Resolve header/footer public URLs for an agency (DB → ITSCO fallback → none).
 */
export async function resolveTenantEmailChrome(agencyId) {
  const aid = Number(agencyId);
  if (!aid) {
    return {
      headerUrl: '',
      footerUrl: '',
      complete: false,
      exampleHeaderUrl: absolutizeAssetUrl(ITSCO_HEADER),
      exampleFooterUrl: absolutizeAssetUrl(ITSCO_FOOTER),
      llmHeaderPrompt: LLM_HEADER_PROMPT,
      llmFooterPrompt: LLM_FOOTER_PROMPT
    };
  }

  let headerPath = '';
  let footerPath = '';
  let agency = null;
  try {
    const [rows] = await pool.execute(
      `SELECT aes.html_email_header_url, aes.html_email_footer_url,
              a.name, a.slug, a.official_name
       FROM agencies a
       LEFT JOIN agency_email_settings aes ON aes.agency_id = a.id
       WHERE a.id = ?
       LIMIT 1`,
      [aid]
    );
    agency = rows?.[0] || null;
    headerPath = String(agency?.html_email_header_url || '').trim();
    footerPath = String(agency?.html_email_footer_url || '').trim();
  } catch {
    /* columns may be missing pre-migration */
  }

  if ((!headerPath || !footerPath) && looksLikeItsco(agency || {})) {
    headerPath = headerPath || ITSCO_HEADER;
    footerPath = footerPath || ITSCO_FOOTER;
  }

  const headerUrl = absolutizeAssetUrl(headerPath);
  const footerUrl = absolutizeAssetUrl(footerPath);
  return {
    headerUrl,
    footerUrl,
    headerPath: headerPath || null,
    footerPath: footerPath || null,
    complete: !!(headerUrl && footerUrl),
    exampleHeaderUrl: absolutizeAssetUrl(ITSCO_HEADER),
    exampleFooterUrl: absolutizeAssetUrl(ITSCO_FOOTER),
    llmHeaderPrompt: LLM_HEADER_PROMPT,
    llmFooterPrompt: LLM_FOOTER_PROMPT,
    agencyName: agency?.name || null
  };
}

/**
 * Wrap any HTML email body with tenant header/footer when assets exist.
 * Idempotent when data-tenant-email-chrome is already present.
 */
export function applyTenantEmailChromeHtml(html, chrome = {}, opts = {}) {
  const raw = String(html || '');
  if (!raw.trim()) return html;
  if (/data-tenant-email-chrome\s*=\s*["']?1["']?/i.test(raw)) return html;

  const headerUrl = String(chrome.headerUrl || '').trim();
  const footerUrl = String(chrome.footerUrl || '').trim();
  if (!headerUrl && !footerUrl) return html;

  const agencyName = escapeHtml(opts.agencyName || chrome.agencyName || '');
  const supportUrl = escapeHtml(opts.supportUrl || `${publicAppBaseUrl()}/support`);
  const replyMailto = escapeHtml(opts.replyMailto || '');
  const unsubscribeUrl = escapeHtml(opts.unsubscribeUrl || '');
  const phone = escapeHtml(opts.agencyPhone || '');
  const website = escapeHtml(opts.agencyWebsite || '');

  const footerLinks = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" style="padding:10px 12px 4px;font-size:12px;line-height:1.55;">
          <a href="${supportUrl}" style="color:#ffffff;text-decoration:underline;margin:0 8px;">Need help? Contact Support</a>
          ${
            replyMailto
              ? `<span style="color:rgba(255,255,255,0.4);">·</span>
          <a href="mailto:${replyMailto}" style="color:#ffffff;text-decoration:underline;margin:0 8px;">Reply to ${replyMailto}</a>`
              : ''
          }
          ${
            unsubscribeUrl
              ? `<span style="color:rgba(255,255,255,0.4);">·</span>
          <a href="${unsubscribeUrl}" style="color:#ffffff;text-decoration:underline;margin:0 8px;">Unsubscribe</a>`
              : ''
          }
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:2px 12px 14px;color:rgba(255,255,255,0.85);font-size:12px;">
          ${website || agencyName}${phone ? ` · ${phone}` : ''}
        </td>
      </tr>
    </table>`;

  const headerBlock = headerUrl
    ? `<img src="${escapeHtml(headerUrl)}" alt="${agencyName}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />`
    : '';

  const footerBlock = footerUrl
    ? `<td style="padding:0;background:#0b3d2e;" data-tenant-email-footer="1">
        <img src="${escapeHtml(footerUrl)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
        <div style="padding:0 12px 8px;margin-top:-92px;position:relative;">${footerLinks}</div>
      </td>`
    : `<td style="padding:16px 12px;background:#0b3d2e;">${footerLinks}</td>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#eef2f6;" data-tenant-email-chrome="1">
  <!-- tenant-email-chrome -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f6;padding:20px 8px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;overflow:hidden;">
        ${headerBlock ? `<tr><td style="padding:0;">${headerBlock}</td></tr>` : ''}
        <tr><td style="padding:0;">${raw}</td></tr>
        <tr>${footerBlock}</tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function wrapOutboundHtmlWithTenantChrome({ html, agencyId, opts = {} } = {}) {
  if (!html || !agencyId) return html;
  const chrome = await resolveTenantEmailChrome(agencyId);
  if (!chrome.complete && !chrome.headerUrl && !chrome.footerUrl) return html;
  return applyTenantEmailChromeHtml(html, chrome, {
    agencyName: chrome.agencyName,
    ...opts
  });
}

export async function updateAgencyHtmlEmailChrome(agencyId, { headerUrl = undefined, footerUrl = undefined } = {}) {
  const aid = Number(agencyId);
  if (!aid) throw Object.assign(new Error('agencyId required'), { status: 400 });

  await pool.execute(
    `INSERT INTO agency_email_settings (agency_id, notifications_enabled)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE agency_id = agency_id`,
    [aid]
  );

  if (headerUrl !== undefined && footerUrl !== undefined) {
    await pool.execute(
      `UPDATE agency_email_settings
       SET html_email_header_url = ?, html_email_footer_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ?`,
      [headerUrl || null, footerUrl || null, aid]
    );
  } else if (headerUrl !== undefined) {
    await pool.execute(
      `UPDATE agency_email_settings SET html_email_header_url = ?, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?`,
      [headerUrl || null, aid]
    );
  } else if (footerUrl !== undefined) {
    await pool.execute(
      `UPDATE agency_email_settings SET html_email_footer_url = ?, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?`,
      [footerUrl || null, aid]
    );
  }

  return resolveTenantEmailChrome(aid);
}

export { ITSCO_HEADER, ITSCO_FOOTER, LLM_HEADER_PROMPT, LLM_FOOTER_PROMPT };
