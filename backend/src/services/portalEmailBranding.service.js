import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

export const isClinicalPortalIdentity = identity => ['clinical_enrollment_portal', 'clinical_appointment_reminders'].includes(identity?.identity_key);
export const isPortalIdentity = identity => isClinicalPortalIdentity(identity) || identity?.identity_key === 'enrollment_portal';
export const portalSenderName = identity => identity?.identity_key === 'clinical_appointment_reminders' ? 'AuricWell Reminders' : identity?.identity_key === 'clinical_enrollment_portal' ? 'AuricWell Portal' : identity?.display_name;
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
  if (slug === 'itsco' || name === 'ITSCO') agencyLogo = 'https://itsco.health/assets/plotline/careers/itsco-logo.png';
  if (slug === 'nlu' || name === 'Next Level Up') agencyLogo = 'https://nextleveluplcc.com/assets/nlu/logo.png';
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
  if (/data-portal-email="v[12]"/.test(String(html || ''))) return html;
  const e = escapePortalHtml;
  const mark = brand.clinical ? 'https://auricwell.com/auricwell/logo.png' : brand.agencyLogo;
  const name = brand.clinical ? 'AuricWell' : brand.name;
  const label = brand.clinical ? brand.displayName.replace(/^AuricWell\s*/, '') : 'Portal';
  const agencyTag = brand.clinical ? `<td align="right" valign="middle" style="padding-left:12px"><table role="presentation" cellspacing="0" cellpadding="0" align="right"><tr>${brand.agencyLogo ? `<td valign="middle" style="padding-right:7px"><img src="${e(brand.agencyLogo)}" alt="" width="38" style="display:block;width:38px;height:auto;border:0"></td>` : ''}<td valign="middle" style="font-size:19px;font-weight:700;color:#234166;line-height:1.3">${e(brand.name)}</td></tr></table></td>` : '';
  const school = brand.products.some(p => p.startsWith('SchoolCareBridge'));
  return `<table role="presentation" data-portal-email="v2" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#26364a"><tr><td align="center" style="padding:18px 10px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dce4ed;border-top:3px solid #16457c;border-radius:8px">
<tr><td style="padding:18px 22px;border-bottom:1px solid #e6ebf1">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" aria-label="${e(brand.displayName)}"><tr>
${mark ? `<td width="42" valign="middle"><img src="${e(mark)}" alt="" width="32" style="display:block;width:32px;height:auto;border:0"></td>` : ''}
<td valign="middle"><div style="font-size:21px;line-height:1.15;font-weight:700;letter-spacing:-0.5px;color:#163e70">${e(name)}</div><div style="font-size:11px;line-height:1.4;letter-spacing:1.1px;color:#627187;margin-top:3px">${e(label).toUpperCase()}</div></td>${agencyTag}
</tr></table>${school ? '<div style="font-size:11px;color:#627187;padding-top:10px">School coordination through SchoolCareBridge</div>' : ''}</td></tr>
<tr><td style="padding:24px 22px 12px;font-size:15px;line-height:1.65;overflow-wrap:anywhere">${html || portalMessageHtml({ text, linkUrl, linkLabel })}</td></tr>
<tr><td style="padding:16px 22px;border-top:1px solid #e6ebf1;font-size:12px;line-height:1.6;color:#627187"><strong style="color:#40536b">${e(brand.name)}</strong><span style="color:#a2adba"> &nbsp;·&nbsp; </span><a href="mailto:${e(brand.replyTo)}" style="color:#16457c;text-decoration:none">Contact your ${brand.clinical ? 'care team' : 'team'}</a><br>${brand.clinical ? `Delivered by ${e(brand.displayName)} for ${e(brand.name)}.` : `Delivered by ${e(brand.displayName)}.`}</td></tr>
</table></td></tr></table>`;
}
