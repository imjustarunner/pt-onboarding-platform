import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

export const isPortalIdentity = identity => ['clinical_enrollment_portal', 'enrollment_portal'].includes(identity?.identity_key);
export const portalSenderName = identity => identity?.identity_key === 'clinical_enrollment_portal' ? 'AuricWell Portal' : identity?.display_name;
export const escapePortalHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const publicUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(url.hostname) ? url.href : ''; } catch { return ''; }
};

export function enrollmentMailBrand({ agency, domain, school = false, channel = null, clinicalOverride }) {
  const clinical = clinicalOverride ?? (!['tutoring', 'coaching', 'consulting'].includes(channel)
    && (school || getMedicalBillingFlags(agency?.feature_flags || {}).clinicalChartEnabled));
  const name = agency.official_name || agency.name;
  const rawLogo = agency.logo_url || agency.logo_path || agency.icon_file_path;
  let agencyLogo = publicUrl(rawLogo) || publicUrl(rawLogo ? publicUploadsUrlFromStoredPath(rawLogo) : '');
  const slug = String(agency.slug || agency.portal_url || '').toLowerCase();
  if (!agencyLogo && (slug === 'itsco' || name === 'ITSCO')) agencyLogo = 'https://itsco.health/assets/plotline/careers/itsco-logo.png';
  if (!agencyLogo && (slug === 'nlu' || name === 'Next Level Up')) agencyLogo = 'https://nextleveluplcc.com/assets/nlu/logo.png';
  return {
    clinical, name, agencyLogo,
    displayName: clinical ? 'AuricWell Portal' : `${name} Portal`,
    fromEmail: clinical ? 'portal@auricwell.com' : `portal@${domain}`,
    replyTo: `support@${domain}`,
    products: [school && 'SchoolCareBridge · school coordination', clinical && 'AuricWell · clinical portal'].filter(Boolean)
  };
}

export function portalMessageHtml({ text, linkUrl, linkLabel = 'Open your portal' }) {
  const href = publicUrl(linkUrl);
  return String(text || '').trim().split(/\n\s*\n/).map(paragraph => {
    if (href && paragraph.trim() === linkUrl) return `<p style="margin:24px 0"><a href="${escapePortalHtml(href)}" style="display:inline-block;background:#16457c;color:#ffffff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:700">${escapePortalHtml(linkLabel)}</a></p>`;
    return `<p style="margin:0 0 18px;line-height:1.65">${escapePortalHtml(paragraph).replaceAll('\n', '<br>')}</p>`;
  }).join('\n');
}

// This frame belongs to the portal, not to the staff member initiating a send.
// All text identities remain visible when the recipient blocks remote images.
export function renderPortalEmail({ brand, text, html, linkUrl, linkLabel }) {
  if (String(html || '').includes('data-portal-email="v1"')) return html;
  const e = escapePortalHtml;
  const mark = brand.clinical ? 'https://auricwell.com/auricwell/logo.png' : brand.agencyLogo;
  const agencyImage = brand.clinical && brand.agencyLogo ? `<img src="${e(brand.agencyLogo)}" alt="${e(brand.name)}" width="64" style="display:block;max-height:56px;width:auto;max-width:80px;border:0;margin-bottom:10px">` : '';
  return `<table role="presentation" data-portal-email="v1" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f5f8;font-family:Arial,Helvetica,sans-serif;color:#23344b"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dce4ed;border-radius:12px">
<tr><td style="padding:26px 24px 20px;border-bottom:1px solid #e2e8f0">
${mark ? `<img src="${e(mark)}" alt="${brand.clinical ? 'AuricWell' : e(brand.name)}" width="56" style="display:block;width:auto;max-width:160px;max-height:56px;margin-bottom:12px;border:0">` : ''}
<div style="font-size:24px;font-weight:700;color:#153d6e">${e(brand.displayName)}</div>
<div style="font-size:13px;margin-top:8px;color:#526580">${brand.clinical ? 'Your clinical portal' : 'Your enrollment and services portal'}</div></td></tr>
<tr><td style="padding:18px 24px;background:#f8fafc">${agencyImage}<span style="font-size:11px;letter-spacing:1.3px;color:#526580">${brand.clinical ? 'YOUR CARE AGENCY' : 'YOUR ORGANIZATION'}</span><div style="font-size:17px;font-weight:700;margin-top:5px">${e(brand.name)}</div>${brand.products.filter(p => p.startsWith('SchoolCareBridge')).map(p => `<div style="font-size:12px;margin-top:8px">${e(p)}</div>`).join('')}</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.65;overflow-wrap:anywhere">${html || portalMessageHtml({ text, linkUrl, linkLabel })}</td></tr>
<tr><td style="padding:20px 24px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#526580"><strong>Need help? Contact ${e(brand.name)}.</strong><br><a href="mailto:${e(brand.replyTo)}" style="color:#16457c">${e(brand.replyTo)}</a><br>${brand.clinical ? `Sent by AuricWell Portal for ${e(brand.name)}.` : `Sent by ${e(brand.displayName)}.`}</td></tr>
</table></td></tr></table>`;
}
