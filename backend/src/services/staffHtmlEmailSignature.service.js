/**
 * Tenant-branded HTML staff email signatures (email-safe tables + inline CSS).
 * ITSCO master layout: photo | name/credentials/title/contact | logo + footer.
 * Eligible: providers, interns, admin, super_admin, CPA. Title line uses profile title (never role).
 */
import pool from '../config/database.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { resolveOrgLogoUrl } from './publicFormBranding.service.js';
import { publicAppBaseUrl } from './contactReminderToken.service.js';
import {
  listSignatureSocialLinks,
  getAgencySignatureTagline,
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

/** Bump when replacing files under frontend/public/email-signatures/staff-html/ */
const STAFF_HTML_ASSET_VERSION = '6';

/** Public CDN mark — works in Gmail before /email-signatures deploy. */
const PLOT_TWIST_EMAIL_MARK_UPLOAD = 'uploads/logos/plottwistco-email-mark.png';
const ITSCO_LEAF_EMAIL_MARK_UPLOAD = 'uploads/logos/itsco-leaf-email-mark.png';
const CONTACT_ICON_UPLOADS = Object.freeze({
  email: 'uploads/logos/icon-email-white.png',
  phone: 'uploads/logos/icon-phone-white.png',
  web: 'uploads/logos/icon-web-white.png'
});

function plotTwistEmailMarkUrl() {
  const uploaded = publicUploadsUrlFromStoredPath(PLOT_TWIST_EMAIL_MARK_UPLOAD);
  if (uploaded) return uploaded;
  return staffHtmlAsset('plottwistco-mark.png');
}

function itscoLeafEmailMarkUrl() {
  const uploaded = publicUploadsUrlFromStoredPath(ITSCO_LEAF_EMAIL_MARK_UPLOAD);
  if (uploaded) return uploaded;
  return staffHtmlAsset('itsco-leaf-mark.png');
}

function contactIconUrl(kind) {
  const key = CONTACT_ICON_UPLOADS[kind];
  const uploaded = key ? publicUploadsUrlFromStoredPath(key) : null;
  if (uploaded) {
    const sep = uploaded.includes('?') ? '&' : '?';
    return `${uploaded}${sep}v=${STAFF_HTML_ASSET_VERSION}`;
  }
  return staffHtmlAsset(`icon-${kind}-white.png`);
}

function assetUrl(relativePath, { absolute = true } = {}) {
  const path = String(relativePath || '').replace(/^\//, '');
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) {
    try {
      const u = new URL(path);
      if (/^(localhost|127\.0\.0\.1)$/i.test(u.hostname)) {
        return `${publicAppBaseUrl()}${u.pathname}${u.search}${u.hash}`;
      }
    } catch {
      /* keep as-is */
    }
    return path;
  }
  if (!absolute) return `/${path}`;
  const base = publicAppBaseUrl();
  return base ? `${base}/${path}` : `/${path}`;
}

function staffHtmlAsset(name, { absolute = true, cacheKey = STAFF_HTML_ASSET_VERSION } = {}) {
  const url = assetUrl(`email-signatures/staff-html/${name}`, { absolute });
  if (!cacheKey) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(cacheKey)}`;
}

function formatDisplayName(firstName, lastName, credential) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const cred = String(credential || '').trim();
  if (!name) return cred || 'Team member';
  if (!cred) return name;
  return `${name}, ${cred}`;
}

/**
 * Marketing / public website host — strip protocol, path, www., and app. portal subdomain.
 * e.g. app.itsco.health → ITSCO.health display / https://itsco.health
 */
function toMarketingWebsiteHost(raw) {
  let host = String(raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .toLowerCase();
  if (!host || !host.includes('.')) return '';
  host = host.replace(/^www\./, '').replace(/^app\./, '');
  return host;
}

function normalizeWebsite(raw, { allowEmpty = false } = {}) {
  const host = toMarketingWebsiteHost(raw);
  if (!host) {
    if (allowEmpty) return { display: '', url: '' };
    return { display: ITSCO_SIGNATURE_DEFAULTS.websiteDisplay, url: ITSCO_SIGNATURE_DEFAULTS.websiteUrl };
  }
  // Preserve common brand casing for known hosts
  const display =
    host === 'itsco.health' ? 'ITSCO.health' : host.replace(/^./, (c) => c.toUpperCase());
  return { display, url: `https://${host}` };
}

function parseColorPalette(agency) {
  try {
    const palette =
      typeof agency?.color_palette === 'string'
        ? JSON.parse(agency.color_palette)
        : agency?.color_palette;
    return palette && typeof palette === 'object' ? palette : {};
  } catch {
    return {};
  }
}

function looksLikeItscoAgency(agency = {}) {
  const hay = `${agency.name || ''} ${agency.official_name || ''} ${agency.slug || ''} ${agency.portal_url || ''} ${agency.custom_domain || ''} ${agency.website_url || ''}`.toLowerCase();
  return hay.includes('itsco');
}

/** Accent + ink from the tenant palette. ITSCO greens are ITSCO-only. */
export function signatureColorsForAgency(agency, isItsco) {
  const palette = parseColorPalette(agency);
  const primary = String(palette.primary || palette.primaryColor || palette.accent || '').trim();
  const secondary = String(palette.secondary || palette.secondaryColor || '').trim();
  if (isItsco) {
    return { ...ITSCO_SIGNATURE_DEFAULTS.colors };
  }
  const accent = primary || secondary || '#111827';
  const ink = secondary || primary || '#111827';
  return {
    navy: ink,
    green: accent,
    greenDark: accent,
    teal: accent,
    divider: '#D1D5DB',
    muted: '#6B7280',
    line: '#E5E7EB'
  };
}

/** ITSCO keeps the two-part house tagline. Everyone else uses a custom quote or nothing. */
export function signatureTaglines({ isItsco = false, customTagline = '' } = {}) {
  const custom = String(customTagline || '').trim();
  if (custom) return { taglineLeft: custom, taglineRight: '' };
  if (isItsco) {
    return {
      taglineLeft: ITSCO_SIGNATURE_DEFAULTS.taglineLeft,
      taglineRight: ITSCO_SIGNATURE_DEFAULTS.taglineRight
    };
  }
  return { taglineLeft: '', taglineRight: '' };
}

function signatureWebsiteForAgency(agency, isItsco) {
  const site = String(agency?.website_url || '').trim();
  const domain = String(agency?.custom_domain || '').trim();
  const raw = site || domain || (isItsco ? ITSCO_SIGNATURE_DEFAULTS.websiteDisplay : '');
  return normalizeWebsite(raw, { allowEmpty: !isItsco });
}

/**
 * Prefer {local-part of primary email}@{tenant mail domain}.
 * e.g. michael@plottwistco.com at ITSCO → michael@itsco.health
 * Falls back to personal_* identity, login alias, then work/email.
 * TISI staff mail is innerstrengthin.com (website theinnerstrengthinstitute.com is not a mailbox domain).
 */
function normalizeStaffMailDomain(domain) {
  const d = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (!d) return '';
  if (d === 'theinnerstrengthinstitute.com') return 'innerstrengthin.com';
  return d;
}

async function resolveTenantStaffContactEmail(userId, agencyId, fallbackEmail = '', primaryEmail = '') {
  const uid = Number(userId || 0);
  const aid = Number(agencyId || 0);
  const primary = String(primaryEmail || fallbackEmail || '')
    .trim()
    .toLowerCase();
  const primaryLocal = primary.includes('@')
    ? primary
        .split('@')[0]
        .replace(/[^a-z0-9._+-]/gi, '')
        .toLowerCase()
    : '';

  let personalAlias = '';
  let tenantDomain = '';
  if (uid && aid) {
    try {
      const [rows] = await pool.execute(
        `SELECT from_email FROM email_sender_identities
         WHERE agency_id = ? AND identity_key = ? AND is_active = 1
         ORDER BY id ASC LIMIT 1`,
        [aid, `personal_${uid}`]
      );
      personalAlias = String(rows?.[0]?.from_email || '')
        .trim()
        .toLowerCase();
      if (personalAlias.includes('@')) {
        tenantDomain = normalizeStaffMailDomain(personalAlias.split('@')[1] || '');
        const local = personalAlias.split('@')[0] || '';
        if (local && tenantDomain) {
          personalAlias = `${local}@${tenantDomain}`;
        }
      }
    } catch {
      /* ignore */
    }
    if (!tenantDomain) {
      try {
        const { resolvePersonalMailboxDomain } = await import('./personalMailbox.service.js');
        const [aRows] = await pool.execute(
          `SELECT id, name, official_name, portal_url, slug, feature_flags FROM agencies WHERE id = ? LIMIT 1`,
          [aid]
        );
        const agency = aRows?.[0] || { id: aid };
        let flags = {};
        try {
          flags =
            typeof agency.feature_flags === 'string'
              ? JSON.parse(agency.feature_flags || '{}')
              : agency.feature_flags || {};
        } catch {
          flags = {};
        }
        tenantDomain = normalizeStaffMailDomain(
          String((await resolvePersonalMailboxDomain(agency, flags)) || '')
        );
      } catch {
        /* ignore */
      }
    }
  }

  if (primaryLocal && tenantDomain) {
    return `${primaryLocal}@${tenantDomain}`;
  }
  if (personalAlias) return personalAlias;

  if (uid && aid) {
    try {
      const [loginRows] = await pool.execute(
        `SELECT email FROM user_login_emails
         WHERE user_id = ? AND agency_id = ?
         ORDER BY id ASC LIMIT 1`,
        [uid, aid]
      );
      const login = String(loginRows?.[0]?.email || '').trim();
      if (login) {
        const at = login.indexOf('@');
        if (at > 0) {
          return `${login.slice(0, at)}@${normalizeStaffMailDomain(login.slice(at + 1)) || login.slice(at + 1)}`;
        }
        return login;
      }
    } catch {
      /* ignore */
    }
  }
  return String(fallbackEmail || '').trim();
}

function normalizePhone(raw, { allowEmpty = false } = {}) {
  const s = String(raw || '').trim();
  if (!s) {
    if (allowEmpty) return { display: '', tel: '' };
    return {
      display: ITSCO_SIGNATURE_DEFAULTS.phoneDisplay,
      tel: ITSCO_SIGNATURE_DEFAULTS.phoneTel
    };
  }
  const digits = s.replace(/\D/g, '');
  const tel = digits
    ? `+${digits.length === 10 ? `1${digits}` : digits}`
    : allowEmpty
      ? ''
      : ITSCO_SIGNATURE_DEFAULTS.phoneTel;
  return { display: s, tel };
}

export function isStaffHtmlSignatureRole(role) {
  return STAFF_HTML_SIGNATURE_ROLES.has(String(role || '').toLowerCase());
}

/** @deprecated Use isStaffHtmlSignatureRole */
export function isProviderSignatureRole(role) {
  return isStaffHtmlSignatureRole(role);
}

/**
 * Department mailboxes (forms, support, schools, hiring, …) use the generated
 * HTML layout. Personal_* identities keep staff signatures.
 */
export const DEPARTMENT_HTML_SIGNATURE_KEYS = new Set([
  'forms',
  'intake',
  'school_intake',
  'support',
  'schools',
  'schoolreply',
  'school_reply',
  'job_applications',
  'hiring_references',
  'notifications',
  'noreply',
  'messages',
  'secure_message',
  'technology',
  'compliance',
  'payroll',
  'people_operations',
  'app',
  'collections',
  'billing'
]);

export function usesDepartmentHtmlSignature(identity) {
  const key = String(identity?.identity_key || '').trim().toLowerCase();
  if (!key || key.startsWith('personal_')) return false;
  if (DEPARTMENT_HTML_SIGNATURE_KEYS.has(key)) return true;
  return Boolean(Number(identity?.agency_id || 0));
}

function departmentTitleFromKey(identityKey) {
  const key = String(identityKey || '').trim().toLowerCase();
  if (key === 'forms') return 'Forms';
  if (key === 'intake' || key === 'school_intake') return 'Intake';
  if (key === 'support') return 'Support';
  if (key === 'schools' || key === 'schoolreply' || key === 'school_reply') return 'Schools';
  if (key === 'job_applications') return 'Careers';
  if (!key) return null;
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
      `SELECT id, name, official_name, slug, logo_url, logo_path, color_palette,
              phone_number, phone_extension, portal_url, custom_domain, website_url, organization_type
       FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    agency = aRows?.[0] || null;
  }

  const isItsco = looksLikeItscoAgency(agency);
  const orgName =
    String(agency?.name || agency?.official_name || '').trim() ||
    (isItsco ? ITSCO_SIGNATURE_DEFAULTS.orgShortName : '');
  const colors = signatureColorsForAgency(agency, isItsco);
  const phone = normalizePhone(
    agency?.phone_number || (isItsco ? ITSCO_SIGNATURE_DEFAULTS.phoneDisplay : ''),
    { allowEmpty: !isItsco }
  );
  const website = signatureWebsiteForAgency(agency, isItsco);

  const pubBase = baseUrl || publicAppBaseUrl();
  let photoUrl = publicUploadsUrlFromStoredPath(u.profile_photo_path) || null;
  if (photoUrl && photoUrl.startsWith('/') && pubBase) photoUrl = `${pubBase}${photoUrl}`;
  if (!photoUrl) photoUrl = staffHtmlAsset('photo-placeholder.png');

  // Prefer agency upload (/uploads/...) — same host as profile photos. Skip Wix CDN.
  let logoUrl = null;
  if (agency?.logo_path) {
    logoUrl = publicUploadsUrlFromStoredPath(agency.logo_path);
  }
  if (!logoUrl) {
    logoUrl = resolveOrgLogoUrl(agency || {}, { baseUrl: pubBase });
    if (logoUrl && logoUrl.startsWith('/') && pubBase) logoUrl = `${pubBase}${logoUrl}`;
  }
  if (/wixstatic\.com|\.wix\.com/i.test(String(logoUrl || ''))) {
    logoUrl = '';
  }
  if (!logoUrl && isItsco) {
    logoUrl = staffHtmlAsset('itsco-main-logo.png', { cacheKey: '6' });
  }

  const email = await resolveTenantStaffContactEmail(
    uid,
    agency?.id || aid,
    u.work_email || u.email || '',
    u.email || ''
  );
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

  let taglineLeft = '';
  let taglineRight = '';
  ({ taglineLeft, taglineRight } = signatureTaglines({ isItsco, customTagline }));

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
      iconEmail: contactIconUrl('email'),
      iconPhone: contactIconUrl('phone'),
      iconWeb: contactIconUrl('web'),
      leaf: itscoLeafEmailMarkUrl(),
      phoenix: plotTwistEmailMarkUrl(),
      placeholderPhoto: staffHtmlAsset('photo-placeholder.png'),
      socialFacebook: staffHtmlAsset('social-facebook.png'),
      socialTwitter: staffHtmlAsset('social-twitter.png'),
      socialInstagram: staffHtmlAsset('social-instagram.png'),
      socialYoutube: staffHtmlAsset('social-youtube.png'),
      socialLinkedin: staffHtmlAsset('social-linkedin.png')
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
  const org = escapeHtml(ctx.orgShortName || '');
  const email = escapeHtml(ctx.email || '');
  const emailHref = ctx.email ? `mailto:${String(ctx.email).replace(/\s/g, '')}` : '#';
  const phoneDisplay = escapeHtml(ctx.phone?.display || '');
  const phoneHref = ctx.phone?.tel
    ? `tel:${String(ctx.phone.tel).replace(/\s/g, '')}`
    : '';
  const rawExt = String(ctx.extension || '').trim();
  const extClean = rawExt.replace(/^(ext\.?|x)\s*/i, '').trim();
  const phoneAlreadyHasExt = /\bext\.?\b/i.test(String(ctx.phone?.display || ''));
  const ext =
    extClean && !phoneAlreadyHasExt ? ` Ext. ${escapeHtml(extClean)}` : '';
  const webDisplay = escapeHtml(ctx.website?.display || '');
  const webHref = escapeHtml(ctx.website?.url || '');
  // mailto links should not open a new tab
  const emailLink = (label) =>
    `<a href="${escapeHtml(emailHref)}" style="color:${c.navy};text-decoration:none !important;border-bottom:none;"><span style="color:${c.navy};text-decoration:none !important;">${label}</span></a>`;
  const phoneLink = (label) =>
    phoneHref
      ? `<a href="${escapeHtml(phoneHref)}" style="color:${c.navy};text-decoration:none !important;border-bottom:none;"><span style="color:${c.navy};text-decoration:none !important;">${label}</span></a>`
      : `<span style="color:${c.navy};">${label}</span>`;
  const webLink = webHref && webDisplay ? plainTextLink(webHref, webDisplay, c.navy) : '';
  const isDepartment = ctx.signatureVariant === 'department';
  const photo = escapeHtml(ctx.photoUrl || ctx.assets?.placeholderPhoto || '');
  // Department layout already puts the tenant logo in the left slot — skip a duplicate on the right rail.
  const logo = isDepartment ? '' : escapeHtml(ctx.logoUrl || '');
  const iconEmail = escapeHtml(ctx.assets?.iconEmail || '');
  const iconPhone = escapeHtml(ctx.assets?.iconPhone || '');
  const iconWeb = escapeHtml(ctx.assets?.iconWeb || '');
  const leaf = escapeHtml(ctx.assets?.leaf || '');
  const phoenix = escapeHtml(ctx.assets?.phoenix || '');
  const tagL = escapeHtml(ctx.taglineLeft || '');
  const tagR = escapeHtml(ctx.taglineRight || '');

  const titleLine = title
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.25;margin:1px 0 0;">
        <span style="color:${c.green};font-weight:700;">${org}</span>
        <span style="color:${c.muted};"> | </span>
        <span style="color:${c.navy};font-weight:400;">${title}</span>
      </div>`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.25;margin:1px 0 0;">
        <span style="color:${c.green};font-weight:700;">${org}</span>
      </div>`;

  const contactRow = (icon, label, valueHtml) => {
    if (!valueHtml) return '';
    // Gmail strips CSS filter. Color the cell with bgcolor so phone/email/web
    // icons pick up the tenant accent without relying on image filters.
    return `
    <tr>
      <td bgcolor="${c.green}" width="14" valign="middle" align="center" style="background-color:${c.green};width:14px;height:14px;padding:1px;vertical-align:middle;text-align:center;line-height:0;border-radius:3px;">
        <img src="${icon}" width="12" height="12" alt="" style="display:block;border:0;width:12px;height:12px;margin:0 auto;" />
      </td>
      <td style="padding:0 0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.25;color:${c.navy};">
        <span style="color:${c.green};font-weight:700;">${label}:</span>&nbsp;${valueHtml}
      </td>
    </tr>`;
  };

  // Compact bottom-left card — not a full-width “from” banner.
  const rightRailWidth = 96;
  const rightRailPad = `padding:0 0 0 6px;`;
  const photoSize = 64;
  const logoWidth = 72;

  const socialIconSrc = (platform) => {
    const a = ctx.assets || {};
    const map = {
      facebook: a.socialFacebook,
      twitter: a.socialTwitter,
      instagram: a.socialInstagram,
      youtube: a.socialYoutube,
      linkedin: a.socialLinkedin
    };
    return map[String(platform || '').toLowerCase()] || '';
  };

  const social = Array.isArray(ctx.socialLinks) ? ctx.socialLinks.filter((l) => l?.url) : [];
  const socialIconCells = social
    .map((link) => {
      const href = escapeHtml(link.url);
      const title = escapeHtml(link.label || platformLabel(link.platform));
      const icon = escapeHtml(socialIconSrc(link.platform));
      if (!icon) return '';
      return `<td align="center" style="padding:0 1px;vertical-align:middle;text-align:center;">
                    <a href="${href}" title="${title}" target="_blank" rel="noopener noreferrer"
                      style="display:inline-block;background:${c.green};border-radius:4px;padding:1px;line-height:0;text-decoration:none !important;border:0;">
                      <img src="${icon}" width="12" height="12" alt="${title}"
                        style="display:block;border:0;width:12px;height:12px;margin:0 auto;" />
                    </a>
                  </td>`;
    })
    .filter(Boolean)
    .join('');
  const socialIconsRow = socialIconCells
    ? `<tr>
        <td align="center" style="text-align:center;padding:4px 0 0;line-height:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto;">
            <tr>
              ${socialIconCells}
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const logoImg = logo
    ? `<img src="${logo}" width="${logoWidth}" alt="${org}"
        style="display:block;border:0;max-width:${logoWidth}px;width:${logoWidth}px;height:auto;margin:0 auto;" />`
    : '';
  const logoLinked = logoImg
    ? webHref
      ? `<a href="${webHref}" target="_blank" rel="noopener noreferrer" style="text-decoration:none !important;border:0;display:inline-block;">${logoImg}</a>`
      : logoImg
    : '';

  const poweredByHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:6px auto 0;">
      <tr>
        <td align="center" style="text-align:center;white-space:nowrap;font-size:0;line-height:0;">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:8px;color:${c.muted};vertical-align:middle;line-height:normal;">powered by</span>
          <img src="${phoenix}" width="16" height="16" alt="PlotTwistCo" style="display:inline-block;border:0;width:16px;height:16px;vertical-align:middle;margin:0 1px 0 2px;" />
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:8px;color:${c.muted};vertical-align:middle;font-weight:600;line-height:normal;">PlotTwistCo</span>
        </td>
      </tr>
    </table>`;

  const logoBlockHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${logoWidth}" style="border-collapse:collapse;margin:0 auto;width:${logoWidth}px;">
      ${
        logoLinked
          ? `<tr>
        <td align="center" style="text-align:center;vertical-align:top;padding:0;line-height:0;">
          ${logoLinked}
        </td>
      </tr>`
          : ''
      }
      ${socialIconsRow}
      <tr>
        <td align="center" style="text-align:center;padding:0;vertical-align:top;">
          ${poweredByHtml}
        </td>
      </tr>
    </table>`;

  // For department (logo already in photo slot), keep socials + powered-by in the right rail.
  const rightRailHtml = isDepartment
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto;">
      ${socialIconsRow || ''}
      <tr><td align="center" style="text-align:center;padding:0;">${poweredByHtml}</td></tr>
    </table>`
    : logoBlockHtml;

  const confidentialHtml = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:8px 0 0;clear:both;" data-pt-signature-confidential="1">
  <tr>
    <td style="padding:0;margin:0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0;">
        <tr><td style="border-top:1px solid ${c.line};font-size:0;line-height:0;height:1px;padding:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>
      </table>
      <div style="margin:4px 0 0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:8px;line-height:1.35;color:#6B7280;">
        <div style="font-weight:700;color:${c.navy};text-transform:uppercase;letter-spacing:0.02em;margin:0 0 2px;padding:0;">
          CONFIDENTIAL AND POTENTIALLY SENSITIVE INFORMATION!
        </div>
        <div style="margin:0;padding:0;">
          The information enclosed in this email may contain privileged and confidential materials intended solely for the individual indicated.
          If you are not the intended recipient, any review, dissemination, distribution, or duplication of this email is strictly prohibited.
          If this email was sent to you by mistake, report it so our support team can escalate and investigate — then destroy all copies of the original message.
        </div>
        ${
          ctx.misdirectedReportUrl
            ? `<div style="margin:8px 0 0;padding:0;">
          <a href="${escapeHtml(ctx.misdirectedReportUrl)}" style="color:#ffffff;background:#1d4ed8;text-decoration:none;padding:6px 10px;border-radius:4px;font-weight:700;display:inline-block;font-size:10px;line-height:1.3;" target="_blank" rel="noopener noreferrer">Report misdirected email</a>
        </div>`
            : ''
        }
      </div>
    </td>
  </tr>
</table>`;

  const photoImgStyle = isDepartment
    ? `display:block;border:1px solid ${c.divider};border-radius:8px;width:${photoSize}px;height:${photoSize}px;object-fit:contain;object-position:center;background:#ffffff;padding:4px;box-sizing:border-box;`
    : `display:block;border:1px solid ${c.green};border-radius:8px;width:${photoSize}px;height:${photoSize}px;object-fit:cover;object-position:center 18%;`;

  // Full width of the 600px chrome column so the signature does not float left
  // and leave a large empty band in Hub / Gmail previews.
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff;margin:12px 0 0;">
  <tr>
    <td style="padding:0;vertical-align:top;width:${photoSize + 6}px;">
      <img src="${photo}" width="${photoSize}" height="${photoSize}" alt="${name}"
        style="${photoImgStyle}" />
    </td>
    <td style="padding:0 2px 0 6px;vertical-align:top;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.2;font-weight:700;color:${c.navy};">
        ${name}
      </div>
      ${titleLine}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:3px 0 1px;">
        <tr><td style="border-top:1px solid ${c.divider};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        ${email ? contactRow(iconEmail, 'Email', emailLink(email)) : ''}
        ${phoneDisplay ? contactRow(iconPhone, 'Phone', `${phoneLink(phoneDisplay)}${ext ? `<span style="color:${c.navy};font-weight:700;">${ext}</span>` : ''}`) : ''}
        ${contactRow(iconWeb, 'Website', webLink)}
      </table>
    </td>
    <td width="${rightRailWidth}" style="width:${rightRailWidth}px;${rightRailPad}vertical-align:top;border-left:1px solid ${c.divider};text-align:center;overflow:visible;">
      ${rightRailHtml}
    </td>
  </tr>
  <tr>
    <td colspan="3" style="padding:2px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        <tr><td style="border-top:1px solid ${c.line};font-size:0;line-height:0;height:1px;padding:0;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="3" style="padding:4px 0 0;vertical-align:middle;">
      ${
        tagL || tagR
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        <tr>
          ${
            ctx.isItsco && leaf
              ? `<td style="vertical-align:middle;width:16px;">
            <img src="${leaf}" width="14" height="18" alt="" style="display:block;border:0;width:14px;height:auto;" />
          </td>`
              : ''
          }
          <td style="vertical-align:middle;${ctx.isItsco && leaf ? 'padding-left:4px;' : ''}font-family:Arial,Helvetica,sans-serif;font-size:8px;letter-spacing:0.02em;line-height:1.2;">
            ${tagL ? `<span style="color:${c.navy};font-weight:700;">${tagL}</span>` : ''}
            ${tagR ? `<span style="color:${c.greenDark};font-weight:700;"> ${tagR}</span>` : ''}
          </td>
        </tr>
      </table>`
          : ''
      }
    </td>
  </tr>
</table>
${confidentialHtml}`.trim();
}

export function buildStaffSignatureText(ctx) {
  if (!ctx) return '';
  const lines = [
    ctx.displayName,
    ctx.title ? `${ctx.orgShortName} | ${ctx.title}` : ctx.orgShortName,
    ctx.email ? `Email: ${ctx.email}` : null,
    ctx.phone?.display
      ? `Phone: ${ctx.phone.display}${
          ctx.extension && ctx.signatureVariant !== 'department' ? ` Ext. ${ctx.extension}` : ''
        }`
      : null,
    ctx.website?.display ? `Website: ${ctx.website.display}` : null,
    '',
    `${ctx.taglineLeft || ''} ${ctx.taglineRight || ''}`.trim() || null
  ].filter((x) => x != null && x !== '');
  return lines.join('\n');
}

/**
 * Resolve branding for forms/intake sender identities (no staff user / no headshot).
 */
export async function resolveDepartmentSignatureContext({
  identity = null,
  agencyId = null,
  baseUrl = null
} = {}) {
  if (!identity && !agencyId) return null;

  const aid = Number(agencyId || identity?.agency_id || 0);
  let agency = null;
  if (aid > 0) {
    const [aRows] = await pool.execute(
      `SELECT id, name, official_name, slug, logo_url, logo_path, color_palette,
              phone_number, phone_extension, portal_url, custom_domain, website_url, organization_type
       FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    agency = aRows?.[0] || null;
  }
  if (!agency && !identity) return null;

  const isItsco = looksLikeItscoAgency(agency);
  const orgName =
    String(agency?.name || agency?.official_name || '').trim() ||
    (isItsco ? ITSCO_SIGNATURE_DEFAULTS.orgShortName : '');
  const colors = signatureColorsForAgency(agency, isItsco);

  const phone = normalizePhone(
    agency?.phone_number || (isItsco ? ITSCO_SIGNATURE_DEFAULTS.phoneDisplay : ''),
    { allowEmpty: !isItsco }
  );
  const website = signatureWebsiteForAgency(agency, isItsco);

  const pubBase = baseUrl || publicAppBaseUrl();
  let logoUrl = null;
  if (agency?.logo_path) {
    logoUrl = publicUploadsUrlFromStoredPath(agency.logo_path);
  }
  if (!logoUrl) {
    logoUrl = resolveOrgLogoUrl(agency || {}, { baseUrl: pubBase });
    if (logoUrl && logoUrl.startsWith('/') && pubBase) logoUrl = `${pubBase}${logoUrl}`;
  }
  if (/wixstatic\.com|\.wix\.com/i.test(String(logoUrl || ''))) {
    logoUrl = '';
  }
  if (!logoUrl && isItsco) {
    logoUrl = staffHtmlAsset('itsco-main-logo.png', { cacheKey: '6' });
  }
  if (logoUrl && logoUrl.startsWith('/') && pubBase) logoUrl = `${pubBase}${logoUrl}`;

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

  let taglineLeft = '';
  let taglineRight = '';
  ({ taglineLeft, taglineRight } = signatureTaglines({ isItsco, customTagline }));

  const identityKey = String(identity?.identity_key || '').trim().toLowerCase();
  const displayName =
    String(identity?.display_name || '').trim() ||
    `${orgName} ${departmentTitleFromKey(identityKey) || 'Team'}`.trim();
  const email = String(identity?.from_email || '').trim();

  return {
    userId: null,
    agencyId: agencyIdResolved,
    signatureVariant: 'department',
    role: null,
    enabled: true,
    eligible: true,
    displayName,
    firstName: null,
    lastName: null,
    credential: null,
    title: departmentTitleFromKey(identityKey),
    email,
    extension: null,
    // Tenant logo occupies the staff photo slot.
    photoUrl: logoUrl || staffHtmlAsset('photo-placeholder.png'),
    logoUrl: logoUrl || '',
    orgShortName: isItsco ? ITSCO_SIGNATURE_DEFAULTS.orgShortName : orgName,
    orgFullName: orgName,
    phone,
    website,
    taglineLeft,
    taglineRight,
    socialLinks,
    colors,
    assets: {
      iconEmail: contactIconUrl('email'),
      iconPhone: contactIconUrl('phone'),
      iconWeb: contactIconUrl('web'),
      leaf: itscoLeafEmailMarkUrl(),
      phoenix: plotTwistEmailMarkUrl(),
      placeholderPhoto: staffHtmlAsset('photo-placeholder.png'),
      socialFacebook: staffHtmlAsset('social-facebook.png'),
      socialTwitter: staffHtmlAsset('social-twitter.png'),
      socialInstagram: staffHtmlAsset('social-instagram.png'),
      socialYoutube: staffHtmlAsset('social-youtube.png'),
      socialLinkedin: staffHtmlAsset('social-linkedin.png')
    },
    isItsco
  };
}

/**
 * Append generated HTML signature for forms/intake department identities.
 */
export async function appendDepartmentHtmlSignature({
  identity = null,
  agencyId = null,
  text = null,
  html = null,
  misdirectedReportUrl = null
} = {}) {
  if (!usesDepartmentHtmlSignature(identity)) {
    return { text, html, appended: false };
  }

  const ctx = await resolveDepartmentSignatureContext({
    identity,
    agencyId: agencyId || identity?.agency_id
  });
  if (!ctx) return { text, html, appended: false };

  const block = buildStaffSignatureHtml({
    ...ctx,
    misdirectedReportUrl: misdirectedReportUrl || null
  });
  const textBlock = buildStaffSignatureText(ctx);
  if (!block) return { text, html, appended: false, ctx };

  const marker = '<!-- pt-department-html-signature -->';
  if (html && String(html).includes(marker)) {
    return { text, html, appended: false, ctx };
  }
  // Also treat staff marker as already signed (idempotent across both paths).
  if (html && String(html).includes('<!-- pt-staff-html-signature -->')) {
    return { text, html, appended: false, ctx };
  }

  const bodyHtml =
    html ||
    `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;">${String(text || '')
      .split('\n')
      .map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line || '').trim() || '&nbsp;'}</p>`)
      .join('')}</div>`;
  const htmlOut = `${String(bodyHtml)}\n${marker}\n<div data-pt-staff-signature="1" data-pt-department-signature="1" style="margin:36px 0 0;padding:0 0 2px;background:#ffffff;text-align:left;">${block}</div><div style="clear:both;height:0;font-size:0;line-height:0;">&nbsp;</div>`;
  const textOut = `${String(text || '').trim()}\n\n--\n${textBlock}`.trim();
  return { text: textOut, html: htmlOut, appended: true, ctx };
}

/**
 * Full preview payload for API / Hub compose.
 * Uses a non-functional placeholder report URL so the compose UI shows the same
 * "Report misdirected email" control recipients get on real sends (token minted at send time).
 */
export async function getStaffSignaturePreview({ userId, agencyId = null } = {}) {
  const ctx = await resolveStaffSignatureContext({ userId, agencyId });
  if (!ctx) return null;
  // Hub preview runs in the browser — prefer same-origin /email-signatures/* paths
  // so local Vite (and any CDN mismatch) still loads icons / phoenix mark.
  const previewReportUrl = '#misdirected-report-preview';
  let html = buildStaffSignatureHtml({
    ...ctx,
    misdirectedReportUrl: previewReportUrl
  });
  html = html.replace(/src="https?:\/\/[^"]+\/(email-signatures\/[^"]+)"/gi, 'src="/$1"');
  return {
    eligible: ctx.eligible,
    enabled: ctx.enabled,
    agencyId: ctx.agencyId,
    reportLinkInSentMail: true,
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
  force = false,
  misdirectedReportUrl = null
} = {}) {
  const ctx = await resolveStaffSignatureContext({ userId, agencyId });
  if (!ctx) return { text, html, appended: false };
  if (!force && (!ctx.eligible || !ctx.enabled)) return { text, html, appended: false, ctx };

  const block = buildStaffSignatureHtml({
    ...ctx,
    misdirectedReportUrl: misdirectedReportUrl || ctx.misdirectedReportUrl || null
  });
  const textBlock = buildStaffSignatureText(ctx);
  if (!block) return { text, html, appended: false, ctx };

  // Idempotent: marker comment
  const marker = '<!-- pt-staff-html-signature -->';
  if (html && String(html).includes(marker)) {
    return { text, html, appended: false, ctx };
  }

  const bodyHtml =
    html ||
    `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;">${String(text || '')
      .split('\n')
      .map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line || '').trim() || '&nbsp;'}</p>`)
      .join('')}</div>`;
  // Space above pulls the card down toward the green footer; keep left, not full-bleed.
  const htmlOut = `${String(bodyHtml)}\n${marker}\n<div data-pt-staff-signature="1" style="margin:36px 0 0;padding:0 0 2px;background:#ffffff;text-align:left;">${block}</div><div style="clear:both;height:0;font-size:0;line-height:0;">&nbsp;</div>`;
  const textOut = `${String(text || '').trim()}\n\n--\n${textBlock}`.trim();
  return { text: textOut, html: htmlOut, appended: true, ctx };
}
