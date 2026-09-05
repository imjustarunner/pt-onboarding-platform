/**
 * Tenant-branded HTML staff email signatures (email-safe tables + inline CSS).
 * ITSCO master layout: photo | name/credentials/title/contact | logo + footer.
 * Eligible: providers, interns, admin, super_admin, CPA. Title line uses profile title (never role).
 */
import pool from '../config/database.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { resolveOrgLogoUrl } from './publicFormBranding.service.js';
import {
  listSignatureSocialLinks,
  getAgencySignatureTagline,
  platformMark,
  platformLabel
} from './agencySocialLinks.service.js';

const STAFF_HTML_SIGNATURE_ROLES = new Set([
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'admin',
  'super_admin',
  'clinical_practice_assistant'
]);

/** Central ITSCO defaults — update once for org-wide contact / branding. */
export const ITSCO_SIGNATURE_DEFAULTS = Object.freeze({
  orgShortName: 'ITSCO',
  phoneDisplay: '719-657-7444',
  phoneTel: '+17196577444',
  websiteDisplay: 'ITSCO.health',
  websiteUrl: 'https://ITSCO.health',
  taglineLeft: 'MENTAL HEALTH SUPPORT.',
  taglineRight: 'STRONGER SCHOOL COMMUNITIES.',
  colors: Object.freeze({
    navy: '#0B1F3A',
    green: '#2E9A43',
    greenDark: '#1E4D2B',
    teal: '#48C3D3',
    divider: '#7CB97F',
    muted: '#6B7280',
    line: '#C2D6C1'
  })
});

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function publicBaseUrl() {
  // Prefer frontend origin for /email-signatures/* and other Vite public assets.
  // BACKEND_PUBLIC_URL often points at API/prod host that does not serve those files locally.
  return String(
    process.env.FRONTEND_URL ||
      process.env.CORS_ORIGIN ||
      process.env.APP_PUBLIC_URL ||
      process.env.BACKEND_PUBLIC_URL ||
      ''
  )
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
}

function assetUrl(relativePath, { absolute = true } = {}) {
  const path = String(relativePath || '').replace(/^\//, '');
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (!absolute) return `/${path}`;
  const base = publicBaseUrl();
  return base ? `${base}/${path}` : `/${path}`;
}

function staffHtmlAsset(name, { absolute = true } = {}) {
  return assetUrl(`email-signatures/staff-html/${name}`, { absolute });
}

function formatDisplayName(firstName, lastName, credential) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const cred = String(credential || '').trim();
  if (!name) return cred || 'Team member';
  if (!cred) return name;
  return `${name}, ${cred}`;
}

function normalizeWebsite(raw) {
  const s = String(raw || '').trim();
  if (!s) return { display: ITSCO_SIGNATURE_DEFAULTS.websiteDisplay, url: ITSCO_SIGNATURE_DEFAULTS.websiteUrl };
  const display = s.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const url = /^https?:\/\//i.test(s) ? s : `https://${display}`;
  return { display, url };
}

function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) {
    return {
      display: ITSCO_SIGNATURE_DEFAULTS.phoneDisplay,
      tel: ITSCO_SIGNATURE_DEFAULTS.phoneTel
    };
  }
  const digits = s.replace(/\D/g, '');
  const tel = digits ? `+${digits.length === 10 ? `1${digits}` : digits}` : ITSCO_SIGNATURE_DEFAULTS.phoneTel;
  return { display: s, tel };
}

export function isStaffHtmlSignatureRole(role) {
  return STAFF_HTML_SIGNATURE_ROLES.has(String(role || '').toLowerCase());
}

/** @deprecated Use isStaffHtmlSignatureRole */
export function isProviderSignatureRole(role) {
  return isStaffHtmlSignatureRole(role);
}

/** Plain-looking mailto/tel/web links — no underline / blue link styling in clients that honor inline CSS. */
function plainTextLink(href, labelHtml, color) {
  return `<a href="${href}" style="color:${color};text-decoration:none !important;border-bottom:none;outline:none;" target="_blank" rel="noopener noreferrer"><span style="color:${color};text-decoration:none !important;">${labelHtml}</span></a>`;
}

/**
 * Resolve branding + staff fields for signature generation.
 */
export async function resolveStaffSignatureContext({
  userId,
  agencyId = null,
  baseUrl = null
} = {}) {
  const uid = Number(userId || 0);
  if (!uid) return null;

  let userRows;
  try {
    [userRows] = await pool.execute(
      `SELECT id, first_name, last_name, preferred_name, email, work_email, title, credential,
              work_phone, work_phone_extension, profile_photo_path,
              email_signature_path, email_signature_enabled, role
       FROM users WHERE id = ? LIMIT 1`,
      [uid]
    );
  } catch {
    [userRows] = await pool.execute(
      `SELECT id, first_name, last_name, preferred_name, email, work_email, title, credential,
              work_phone, work_phone_extension, profile_photo_path,
              email_signature_path, role
       FROM users WHERE id = ? LIMIT 1`,
      [uid]
    );
  }

  const u = userRows?.[0];
  if (!u) return null;

  let agency = null;
  const aid = Number(agencyId || 0);
  if (aid > 0) {
    const [aRows] = await pool.execute(
      `SELECT id, name, official_name, logo_url, logo_path, color_palette,
              phone_number, phone_extension, portal_url, custom_domain, organization_type
       FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    agency = aRows?.[0] || null;
  }

  const orgName =
    String(agency?.name || agency?.official_name || ITSCO_SIGNATURE_DEFAULTS.orgShortName).trim() ||
    ITSCO_SIGNATURE_DEFAULTS.orgShortName;

  const isItsco = /itsco/i.test(orgName) || /itsco/i.test(String(agency?.custom_domain || ''));
  const colors = { ...ITSCO_SIGNATURE_DEFAULTS.colors };
  try {
    const palette =
      typeof agency?.color_palette === 'string'
        ? JSON.parse(agency.color_palette)
        : agency?.color_palette;
    if (palette?.primary || palette?.primaryColor) {
      colors.green = String(palette.primary || palette.primaryColor);
    }
  } catch {
    /* keep defaults */
  }

  const phone = normalizePhone(
    isItsco ? ITSCO_SIGNATURE_DEFAULTS.phoneDisplay : agency?.phone_number || ITSCO_SIGNATURE_DEFAULTS.phoneDisplay
  );
  const website = normalizeWebsite(
    isItsco
      ? ITSCO_SIGNATURE_DEFAULTS.websiteDisplay
      : agency?.portal_url || agency?.custom_domain || ITSCO_SIGNATURE_DEFAULTS.websiteDisplay
  );

  const pubBase = baseUrl || publicBaseUrl();
  let photoUrl = publicUploadsUrlFromStoredPath(u.profile_photo_path) || null;
  if (photoUrl && photoUrl.startsWith('/') && pubBase) photoUrl = `${pubBase}${photoUrl}`;
  if (!photoUrl) photoUrl = staffHtmlAsset('photo-placeholder.png');

  let logoUrl = null;
  if (isItsco) {
    logoUrl = staffHtmlAsset('itsco-main-logo.png');
  } else {
    logoUrl = resolveOrgLogoUrl(agency || {}, { baseUrl: pubBase }) || staffHtmlAsset('itsco-main-logo.png');
    if (logoUrl && logoUrl.startsWith('/') && pubBase) logoUrl = `${pubBase}${logoUrl}`;
  }

  const email = String(u.work_email || u.email || '').trim();
  const enabled =
    u.email_signature_enabled === undefined || u.email_signature_enabled === null
      ? true
      : !(u.email_signature_enabled === 0 || u.email_signature_enabled === false || u.email_signature_enabled === '0');

  const agencyIdResolved = agency?.id || aid || null;
  let socialLinks = [];
  let customTagline = null;
  try {
    if (agencyIdResolved) {
      socialLinks = await listSignatureSocialLinks(agencyIdResolved);
      customTagline = await getAgencySignatureTagline(agencyIdResolved);
    }
  } catch {
    socialLinks = [];
    customTagline = null;
  }

  let taglineLeft = ITSCO_SIGNATURE_DEFAULTS.taglineLeft;
  let taglineRight = ITSCO_SIGNATURE_DEFAULTS.taglineRight;
  if (customTagline) {
    taglineLeft = customTagline;
    taglineRight = '';
  } else if (!isItsco) {
    taglineLeft = orgName;
    taglineRight = '';
  }

  return {
    userId: uid,
    agencyId: agencyIdResolved,
    role: u.role,
    enabled,
    eligible: isStaffHtmlSignatureRole(u.role),
    displayName: formatDisplayName(u.first_name, u.last_name, u.credential),
    firstName: u.first_name,
    lastName: u.last_name,
    credential: String(u.credential || '').trim() || null,
    // Job title from profile — never substitute role (admin / CPA / etc.)
    title: String(u.title || '').trim() || null,
    email,
    extension: String(u.work_phone_extension || '').trim() || null,
    photoUrl,
    logoUrl,
    orgShortName: isItsco ? ITSCO_SIGNATURE_DEFAULTS.orgShortName : orgName,
    orgFullName: orgName,
    phone,
    website,
    taglineLeft,
    taglineRight,
    socialLinks,
    colors,
    assets: {
      iconEmail: staffHtmlAsset('icon-email.png'),
      iconPhone: staffHtmlAsset('icon-phone.png'),
      iconWeb: staffHtmlAsset('icon-web.png'),
      leaf: staffHtmlAsset('itsco-leaf-mark.png'),
      phoenix: staffHtmlAsset('phoenix-mark.png'),
      placeholderPhoto: staffHtmlAsset('photo-placeholder.png')
    },
    isItsco
  };
}

/**
 * Build email-safe HTML signature table.
 */
export function buildStaffSignatureHtml(ctx) {
  if (!ctx) return '';
  const c = ctx.colors || ITSCO_SIGNATURE_DEFAULTS.colors;
  const name = escapeHtml(ctx.displayName);
  const title = escapeHtml(ctx.title || '');
  const org = escapeHtml(ctx.orgShortName || 'ITSCO');
  const email = escapeHtml(ctx.email || '');
  const emailHref = ctx.email ? `mailto:${String(ctx.email).replace(/\s/g, '')}` : '#';
  const phoneDisplay = escapeHtml(ctx.phone?.display || ITSCO_SIGNATURE_DEFAULTS.phoneDisplay);
  const phoneHref = `tel:${String(ctx.phone?.tel || ITSCO_SIGNATURE_DEFAULTS.phoneTel).replace(/\s/g, '')}`;
  const ext = ctx.extension ? ` Ext. ${escapeHtml(ctx.extension)}` : '';
  const webDisplay = escapeHtml(ctx.website?.display || ITSCO_SIGNATURE_DEFAULTS.websiteDisplay);
  const webHref = escapeHtml(ctx.website?.url || ITSCO_SIGNATURE_DEFAULTS.websiteUrl);
  // mailto links should not open a new tab
  const emailLink = (label) =>
    `<a href="${escapeHtml(emailHref)}" style="color:${c.navy};text-decoration:none !important;border-bottom:none;"><span style="color:${c.navy};text-decoration:none !important;">${label}</span></a>`;
  const phoneLink = (label) =>
    `<a href="${escapeHtml(phoneHref)}" style="color:${c.navy};text-decoration:none !important;border-bottom:none;"><span style="color:${c.navy};text-decoration:none !important;">${label}</span></a>`;
  const webLink = plainTextLink(webHref, webDisplay, c.navy);
  const photo = escapeHtml(ctx.photoUrl || ctx.assets?.placeholderPhoto || '');
  const logo = escapeHtml(ctx.logoUrl || '');
  const iconEmail = escapeHtml(ctx.assets?.iconEmail || '');
  const iconPhone = escapeHtml(ctx.assets?.iconPhone || '');
  const iconWeb = escapeHtml(ctx.assets?.iconWeb || '');
  const leaf = escapeHtml(ctx.assets?.leaf || '');
  const phoenix = escapeHtml(ctx.assets?.phoenix || '');
  const tagL = escapeHtml(ctx.taglineLeft || ITSCO_SIGNATURE_DEFAULTS.taglineLeft);
  const tagR = escapeHtml(ctx.taglineRight || ITSCO_SIGNATURE_DEFAULTS.taglineRight);

  const titleLine = title
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.3;margin:1px 0 0;">
        <span style="color:${c.green};font-weight:700;">${org}</span>
        <span style="color:${c.muted};"> | </span>
        <span style="color:${c.navy};font-weight:400;">${title}</span>
      </div>`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.3;margin:1px 0 0;">
        <span style="color:${c.green};font-weight:700;">${org}</span>
      </div>`;

  const contactRow = (icon, label, valueHtml) => `
    <tr>
      <td style="padding:2px 0;vertical-align:middle;width:20px;">
        <img src="${icon}" width="16" height="16" alt="" style="display:block;border:0;width:16px;height:16px;" />
      </td>
      <td style="padding:2px 0 2px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.3;color:${c.navy};">
        <span style="color:${c.green};font-weight:700;">${label}:</span>&nbsp;${valueHtml}
      </td>
    </tr>`;

  // Shared right-rail width so the top green divider and footer gray divider share one vertical axis.
  const rightRailWidth = 188;
  const rightRailPad = `padding:8px 4px 8px 14px;`;

  const social = Array.isArray(ctx.socialLinks) ? ctx.socialLinks.filter((l) => l?.url) : [];
  const socialIconsHtml = social.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:10px auto 0;">
        <tr>
          ${social
            .map((link) => {
              const href = escapeHtml(link.url);
              const mark = escapeHtml(platformMark(link.platform));
              const title = escapeHtml(link.label || platformLabel(link.platform));
              return `<td style="padding:0 3px;vertical-align:middle;">
                <a href="${href}" title="${title}" target="_blank" rel="noopener noreferrer"
                  style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:6px;background:${c.green};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;text-decoration:none !important;">
                  ${mark}
                </a>
              </td>`;
            })
            .join('')}
        </tr>
      </table>`
    : '';

  const confidentialHtml = `
    <tr>
      <td colspan="3" style="padding:12px 0 0;" data-pt-signature-confidential="1">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <tr><td style="border-top:1px solid ${c.line};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
        </table>
        <div style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;color:#6B7280;">
          <div style="font-weight:700;color:${c.navy};text-transform:uppercase;letter-spacing:0.02em;margin-bottom:4px;">
            CONFIDENTIAL AND POTENTIALLY SENSITIVE INFORMATION!
          </div>
          <div>
            The information enclosed in this email may contain privileged and confidential materials intended solely for the individual indicated.
            If you are not the intended recipient, any review, dissemination, distribution, or duplication of this email is strictly prohibited.
            If you are not the intended recipient, please contact the sender by reply email and destroy all copies of the original message.
          </div>
        </div>
      </td>
    </tr>`;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:620px;width:100%;background:#ffffff;">
  <tr>
    <td style="padding:0;vertical-align:middle;width:118px;">
      <img src="${photo}" width="110" height="110" alt="${name}"
        style="display:block;border:2px solid ${c.green};border-radius:12px;width:110px;height:110px;object-fit:cover;object-position:center 18%;" />
    </td>
    <td style="padding:0 10px;vertical-align:middle;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.2;font-weight:700;color:${c.navy};">
        ${name}
      </div>
      ${titleLine}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:8px 0 6px;">
        <tr><td style="border-top:1px solid ${c.divider};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        ${email ? contactRow(iconEmail, 'Email', emailLink(email)) : ''}
        ${contactRow(iconPhone, 'Phone', `${phoneLink(phoneDisplay)}${ext ? `<span style="color:${c.navy};font-weight:700;">${ext}</span>` : ''}`)}
        ${contactRow(iconWeb, 'Website', webLink)}
      </table>
    </td>
    <td width="${rightRailWidth}" style="width:${rightRailWidth}px;${rightRailPad}vertical-align:middle;border-left:1px solid ${c.divider};">
      <img src="${logo}" width="160" alt="${org}"
        style="display:block;border:0;max-width:160px;width:160px;height:auto;margin:0 auto;" />
      ${socialIconsHtml}
    </td>
  </tr>
  <tr>
    <td colspan="3" style="padding:10px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        <tr><td style="border-top:1px solid ${c.line};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:8px 10px 0 0;vertical-align:middle;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;width:24px;">
            <img src="${leaf}" width="20" height="26" alt="" style="display:block;border:0;width:20px;height:auto;" />
          </td>
          <td style="vertical-align:middle;padding-left:6px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.02em;line-height:1.25;">
            <span style="color:${c.navy};font-weight:700;">${tagL}</span>
            ${tagR ? `<span style="color:${c.greenDark};font-weight:700;"> ${tagR}</span>` : ''}
          </td>
        </tr>
      </table>
    </td>
    <td width="${rightRailWidth}" style="width:${rightRailWidth}px;padding:8px 4px 0 14px;vertical-align:middle;border-left:1px solid ${c.line};white-space:nowrap;">
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${c.muted};vertical-align:middle;">powered by</span>
      <img src="${phoenix}" width="32" height="26" alt="PlotTwistCo" style="display:inline-block;border:0;width:32px;height:auto;vertical-align:middle;margin:0 3px 0 5px;" />
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${c.muted};vertical-align:middle;font-weight:600;">PlotTwistCo</span>
    </td>
  </tr>
  ${confidentialHtml}
</table>`.trim();
}

export function buildStaffSignatureText(ctx) {
  if (!ctx) return '';
  const lines = [
    ctx.displayName,
    ctx.title ? `${ctx.orgShortName} | ${ctx.title}` : ctx.orgShortName,
    ctx.email ? `Email: ${ctx.email}` : null,
    `Phone: ${ctx.phone?.display || ITSCO_SIGNATURE_DEFAULTS.phoneDisplay}${ctx.extension ? ` Ext. ${ctx.extension}` : ''}`,
    `Website: ${ctx.website?.display || ITSCO_SIGNATURE_DEFAULTS.websiteDisplay}`,
    '',
    `${ctx.taglineLeft || ''} ${ctx.taglineRight || ''}`.trim()
  ].filter((x) => x != null);
  return lines.join('\n');
}

/**
 * Full preview payload for API / Hub compose.
 */
export async function getStaffSignaturePreview({ userId, agencyId = null } = {}) {
  const ctx = await resolveStaffSignatureContext({ userId, agencyId });
  if (!ctx) return null;
  // Hub preview runs in the browser — prefer same-origin /email-signatures/* paths
  // so local Vite (and any CDN mismatch) still loads icons / phoenix mark.
  let html = buildStaffSignatureHtml(ctx);
  html = html.replace(/src="https?:\/\/[^"]+\/(email-signatures\/[^"]+)"/gi, 'src="/$1"');
  return {
    eligible: ctx.eligible,
    enabled: ctx.enabled,
    agencyId: ctx.agencyId,
    html,
    text: buildStaffSignatureText(ctx),
    fields: {
      displayName: ctx.displayName,
      credential: ctx.credential,
      title: ctx.title,
      email: ctx.email,
      extension: ctx.extension,
      photoUrl: ctx.photoUrl,
      orgShortName: ctx.orgShortName,
      phone: ctx.phone,
      website: ctx.website
    }
  };
}

/**
 * Append HTML staff signature when eligible (provider + enabled).
 */
export async function appendStaffHtmlSignature({
  userId,
  agencyId = null,
  text = null,
  html = null,
  force = false
} = {}) {
  const ctx = await resolveStaffSignatureContext({ userId, agencyId });
  if (!ctx) return { text, html, appended: false };
  if (!force && (!ctx.eligible || !ctx.enabled)) return { text, html, appended: false, ctx };

  const block = buildStaffSignatureHtml(ctx);
  const textBlock = buildStaffSignatureText(ctx);
  if (!block) return { text, html, appended: false, ctx };

  // Idempotent: marker comment
  const marker = '<!-- pt-staff-html-signature -->';
  if (html && String(html).includes(marker)) {
    return { text, html, appended: false, ctx };
  }

  const htmlOut = html
    ? `${String(html)}\n${marker}\n<div style="margin-top:18px;">${block}</div>`
    : `${marker}\n<div style="margin-top:8px;">${block}</div>`;
  const textOut = `${String(text || '').trim()}\n\n--\n${textBlock}`.trim();
  return { text: textOut, html: htmlOut, appended: true, ctx };
}
