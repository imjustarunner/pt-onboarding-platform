/**
 * Tenant HTML email header/footer chrome.
 * Preferred: uploaded assets stored on agency_email_settings as /uploads/...
 * (same public host as other agency images). Bundled /email-branding/{slug}/ is fallback only.
 */
import pool from '../config/database.js';
import { publicAppBaseUrl } from './contactReminderToken.service.js';
import { buildPublicMarketingUrl } from '../utils/publicPortalUrl.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

  const ITSCO_HEADER = '/email-branding/itsco/email-header.png';
const ITSCO_FOOTER = '/email-branding/itsco/email-footer.png';
const NLU_HEADER = '/email-branding/nlu/email-header.png';
const NLU_FOOTER = '/email-branding/nlu/email-footer.png';
const INNER_HEADER = '/email-branding/innerstrength/email-header.png';
const INNER_FOOTER = '/email-branding/innerstrength/email-footer.png';
const MH4KIDZ_HEADER = '/email-branding/mh4kidz/email-header.png';
const MH4KIDZ_FOOTER = '/email-branding/mh4kidz/email-footer.png';
const MENTAL_RANGE_HEADER = '/email-branding/mentalrange/email-header.png';
const MENTAL_RANGE_FOOTER = '/email-branding/mentalrange/email-footer.png';
const PLOT_TWIST_HEADER = '/email-branding/plottwistco/email-header.png';
const PLOT_TWIST_FOOTER = '/email-branding/plottwistco/email-footer.png';

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

const EMAIL_CHROME_ASSET_VERSION = '6';

function rewriteLocalhostToPublic(url) {
  const s = String(url || '').trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    if (!/^(localhost|127\.0\.0\.1)$/i.test(u.hostname)) return s;
    const base = publicAppBaseUrl();
    return `${base}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return s;
  }
}

function absolutizeAssetUrl(pathOrUrl) {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    let url = rewriteLocalhostToPublic(raw);
    if (/\/email-branding\//i.test(url) && !/[?&]v=/.test(url)) {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}v=${EMAIL_CHROME_ASSET_VERSION}`;
    }
    return url;
  }
  // Uploaded header/footer — same public URL pattern as logos / user photos.
  if (/^\/?uploads\//i.test(raw) || /^logos\//i.test(raw.replace(/^\/+/, ''))) {
    return publicUploadsUrlFromStoredPath(raw) || '';
  }
  const base = publicAppBaseUrl();
  const path = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
  const url = `${base}${path}`;
  if (/\/email-branding\//i.test(path) && !/[?&]v=/.test(url)) {
    return `${url}?v=${EMAIL_CHROME_ASSET_VERSION}`;
  }
  return url;
}

function looksLikeItsco(agency = {}) {
  const hay = `${agency.name || ''} ${agency.slug || ''} ${agency.official_name || ''} ${agency.portal_url || ''}`.toLowerCase();
  return hay.includes('itsco');
}

function looksLikeNlu(agency = {}) {
  const hay = `${agency.name || ''} ${agency.slug || ''} ${agency.official_name || ''} ${agency.portal_url || ''}`.toLowerCase();
  return /\bnext level up\b/.test(hay) || /\bnlu\b/.test(hay) || hay.includes('nextlevelup');
}

function looksLikeInnerStrength(agency = {}) {
  const hay = `${agency.name || ''} ${agency.slug || ''} ${agency.official_name || ''} ${agency.portal_url || ''}`.toLowerCase();
  return hay.includes('inner strength') || hay.includes('innerstrength') || /\btisi\b/.test(hay);
}

function looksLikeMh4kidz(agency = {}) {
  const hay = `${agency.name || ''} ${agency.slug || ''} ${agency.official_name || ''} ${agency.portal_url || ''}`.toLowerCase();
  return hay.includes('mh4kidz') || hay.includes('mh4 kids') || hay.includes('mental health for kids');
}

function looksLikeMentalRange(agency = {}) {
  const hay = `${agency.name || ''} ${agency.slug || ''} ${agency.official_name || ''} ${agency.portal_url || ''}`.toLowerCase();
  return hay.includes('mental range') || hay.includes('mentalrange');
}

function looksLikePlotTwist(agency = {}) {
  const hay = `${agency.name || ''} ${agency.slug || ''} ${agency.official_name || ''} ${agency.portal_url || ''}`.toLowerCase();
  return hay.includes('plottwist') || hay.includes('plot twist');
}

function bundledChromeFallback(agency = {}) {
  if (looksLikeItsco(agency)) return { header: ITSCO_HEADER, footer: ITSCO_FOOTER };
  if (looksLikeNlu(agency)) return { header: NLU_HEADER, footer: NLU_FOOTER };
  if (looksLikeInnerStrength(agency)) return { header: INNER_HEADER, footer: INNER_FOOTER };
  if (looksLikeMh4kidz(agency)) return { header: MH4KIDZ_HEADER, footer: MH4KIDZ_FOOTER };
  if (looksLikeMentalRange(agency)) return { header: MENTAL_RANGE_HEADER, footer: MENTAL_RANGE_FOOTER };
  if (looksLikePlotTwist(agency)) return { header: PLOT_TWIST_HEADER, footer: PLOT_TWIST_FOOTER };
  return null;
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
              a.name, a.slug, a.official_name, a.portal_url, a.custom_domain,
              a.organization_type, a.website_url
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

  if ((!headerPath || !footerPath)) {
    const bundled = bundledChromeFallback(agency || {});
    if (bundled) {
      headerPath = headerPath || bundled.header;
      footerPath = footerPath || bundled.footer;
    }
  }

  const headerUrl = absolutizeAssetUrl(headerPath);
  const footerUrl = absolutizeAssetUrl(footerPath);
  // Marketing site (itsco.health/support), not the app portal (app.itsco.health/support).
  const supportUrl = agency
    ? buildPublicMarketingUrl(agency, 'support')
    : `${publicAppBaseUrl()}/support`;
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
    agencyName: agency?.name || null,
    supportUrl
  };
}

/**
 * Wrap any HTML email body with tenant header/footer when assets exist.
 * Idempotent when data-tenant-email-chrome is already present.
 * Renders one continuous 600px column: header → body/signature → footer (no gaps).
 */
export function applyTenantEmailChromeHtml(html, chrome = {}, opts = {}) {
  let raw = String(html || '');
  if (!raw.trim()) return html;
  if (/data-tenant-email-chrome\s*=\s*["']?1["']?/i.test(raw)) return html;

  const headerUrl = String(chrome.headerUrl || '').trim();
  const footerUrl = String(chrome.footerUrl || '').trim();
  const supportHref = String(opts.supportUrl || chrome.supportUrl || '').trim();
  // Always keep Contact Support, even when header/footer art is missing.
  if (!headerUrl && !footerUrl && !supportHref) return html;

  // If a full document was passed (legacy), use only the body contents.
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) raw = bodyMatch[1];
  // Drop nested outer gray frames from older hub templates.
  raw = raw
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<\/?head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');

  const agencyName = escapeHtml(opts.agencyName || chrome.agencyName || '');
  const supportUrl = escapeHtml(
    opts.supportUrl || chrome.supportUrl || `${publicAppBaseUrl()}/support`
  );
  const replyMailto = escapeHtml(opts.replyMailto || '');
  const unsubscribeUrl = escapeHtml(opts.unsubscribeUrl || '');
  const phone = escapeHtml(opts.agencyPhone || '');
  const website = escapeHtml(opts.agencyWebsite || '');

  // replyMailto kept in opts for chrome callers; footer no longer shows Reply-to
  // (recipients can reply to the message itself).
  void replyMailto;

  const footerLinks = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 auto;">
      <tr>
        <td align="center" style="padding:0;margin:0;font-size:13px;line-height:1.4;font-family:Arial,Helvetica,sans-serif;text-align:center;">
          <div style="margin:0 auto;padding:0;text-align:center;width:100%;">
            <a href="${supportUrl}" style="color:#0B1F3A;text-decoration:underline;font-weight:700;font-size:13px;line-height:1.4;">Need Help?</a>
          </div>
          <div style="margin:4px auto 0;padding:0;text-align:center;width:100%;">
            <a href="${supportUrl}" style="color:#17486b;text-decoration:underline;font-weight:600;font-size:13px;line-height:1.4;">Contact Support</a>
          </div>
          ${
            unsubscribeUrl
              ? `<div style="margin:8px auto 0;padding:0;text-align:center;width:100%;">
            <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline;font-size:11px;">Unsubscribe</a>
          </div>`
              : ''
          }
        </td>
      </tr>
    </table>`;

  const headerBlock = headerUrl
    ? `<img src="${escapeHtml(headerUrl)}" alt="${agencyName}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;margin:0 auto;padding:0;line-height:0;" />`
    : '';

  // Photoshop-style overlay: zero-height layer first (Gmail honors
  // max-height:0 + opacity:0.999 as a stacking context), then the same
  // full-width <img> as v4 so art keeps its natural aspect ratio.
  const footerEsc = escapeHtml(footerUrl);
  const footerBlock = footerUrl
    ? `<td style="padding:0;margin:0;background:#ffffff;" align="center" data-tenant-email-footer="1">
        <div style="max-height:0;position:relative;opacity:0.999;overflow:visible;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;max-width:600px;margin:0 auto;">
            <tr>
              <td width="28%" style="width:28%;font-size:0;line-height:0;">&nbsp;</td>
              <td width="44%" align="center" valign="top" style="width:44%;padding:78px 4px 0;text-align:center;vertical-align:top;">
                ${footerLinks}
              </td>
              <td width="28%" style="width:28%;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
          </table>
        </div>
        <img src="${footerEsc}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;margin:0 auto;padding:0;line-height:0;" />
      </td>`
    : `<td style="padding:18px 24px;background:#ffffff;text-align:center;">${footerLinks}
        ${
          website || agencyName || phone
            ? `<div style="padding:6px 12px 0;color:#334155;font-size:11px;font-family:Arial,Helvetica,sans-serif;">${website || agencyName}${phone ? ` · ${phone}` : ''}</div>`
            : ''
        }
      </td>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#eef2f6;" data-tenant-email-chrome="1">
  <!-- tenant-email-chrome -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background:#eef2f6;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:8px 12px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff;margin:0 auto;padding:0;">
          ${headerBlock ? `<tr><td style="padding:0;margin:0;line-height:0;font-size:0;">${headerBlock}</td></tr>` : ''}
          <tr><td style="padding:6px 24px 10px;margin:0;background:#ffffff;vertical-align:top;">${raw}</td></tr>
          <tr>${footerBlock}</tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;
}

async function resolveEmailChromeAgencyId(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT id, parent_id, organization_type FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    const row = rows?.[0];
    if (!row) return aid;
    const type = String(row.organization_type || '').toLowerCase();
    if (!['school', 'program', 'learning', 'affiliation'].includes(type)) return aid;

    const parentId = Number(row.parent_id || 0);
    if (parentId) return parentId;

    const { default: OrganizationAffiliation } = await import('../models/OrganizationAffiliation.model.js');
    const linked = await OrganizationAffiliation.getActiveAgencyIdForOrganization(aid);
    if (linked) return Number(linked);

    const { default: AgencySchool } = await import('../models/AgencySchool.model.js');
    const schoolLinked = await AgencySchool.getActiveAgencyIdForSchool(aid);
    if (schoolLinked) return Number(schoolLinked);
  } catch {
    /* keep the original agency */
  }
  return aid;
}

export async function wrapOutboundHtmlWithTenantChrome({ html, agencyId, opts = {} } = {}) {
  if (!html) return html;
  const chromeAgencyId = agencyId ? await resolveEmailChromeAgencyId(agencyId) : null;
  const chrome = chromeAgencyId
    ? await resolveTenantEmailChrome(chromeAgencyId)
    : {
        headerUrl: '',
        footerUrl: '',
        supportUrl: opts.supportUrl || `${publicAppBaseUrl()}/support`,
        agencyName: opts.agencyName || ''
      };
  return applyTenantEmailChromeHtml(html, chrome, {
    agencyName: chrome.agencyName,
    supportUrl: chrome.supportUrl,
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

export { ITSCO_HEADER, ITSCO_FOOTER, NLU_HEADER, NLU_FOOTER, INNER_HEADER, INNER_FOOTER, MH4KIDZ_HEADER, MH4KIDZ_FOOTER, MENTAL_RANGE_HEADER, MENTAL_RANGE_FOOTER, PLOT_TWIST_HEADER, PLOT_TWIST_FOOTER, LLM_HEADER_PROMPT, LLM_FOOTER_PROMPT };
