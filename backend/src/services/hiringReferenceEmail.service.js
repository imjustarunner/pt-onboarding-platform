import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { publicAppBaseUrl } from './contactReminderToken.service.js';
import { resolveOrgLogoUrl } from './publicFormBranding.service.js';
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const PLOTLINE_REFERENCE_TAGLINE = 'A People Operations Platform';
export function referenceDeadlineDate(value) {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
export function referenceEmployerBrand(agency = {}) {
  const careers = parse(agency.careers_page_json), palette = parse(agency.color_palette);
  const color = [careers.accentColor, palette.primary, agency.primary_color].find(value => /^#[a-f0-9]{6}$/i.test(value || '')) || '#176b53';
  let logoUrl = agency.logo_path ? publicUploadsUrlFromStoredPath(agency.logo_path) : agency.logo_url;
  logoUrl ||= resolveOrgLogoUrl(agency, { baseUrl: publicAppBaseUrl() });
  try { logoUrl = logoUrl ? new URL(logoUrl, publicAppBaseUrl()).href : null; } catch { logoUrl = null; }
  if (!/^https:\/\//i.test(logoUrl || '')) logoUrl = null;
  return { color, logoUrl };
}
function employerHeader(agency,departmentLabel='PEOPLE OPERATIONS') {
  const name = escape(agency?.name || agency?.official_name || 'People Operations');
  const { color, logoUrl } = referenceEmployerBrand(agency);
  const logo = logoUrl ? `<td width="68" valign="middle" style="padding-right:12px"><img src="${escape(logoUrl)}" alt="${name}" width="56" style="display:block;max-width:56px;max-height:56px;width:auto;height:auto;border:0"></td>` : '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-bottom:2px solid ${color}"><tr>${logo}<td valign="middle" style="padding:12px 0 16px"><div style="font-size:17px;font-weight:bold;color:#203b33;line-height:1.4">${name}</div><div style="font-size:11px;letter-spacing:.8px;color:#546c62;margin-top:3px">${escape(departmentLabel)}</div></td></tr></table>`;
}

export function referenceEmailFrame({ agency, heading, body, footer = '', marketing = true, departmentLabel = 'PEOPLE OPERATIONS' }) {
  const card = marketing ? `<div style="margin-top:28px;padding:20px;background:#f3f0e9;border:1px solid #e6e0d6;border-radius:10px"><strong style="color:#143e33">People are the heart of your organization.</strong><p style="margin:8px 0;font-size:14px">Meet Plotline — ${PLOTLINE_REFERENCE_TAGLINE}. Bring hiring, onboarding and your employee experience together.</p><a href="https://plotlinepo.com/plotline/start" style="color:#143e33;font-size:14px;font-weight:bold;text-decoration:underline">Want to use Plotline for your organization?</a></div>` : '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f0e9" style="background:#f3f0e9;font:16px/1.65 Arial,Helvetica,sans-serif;color:#203b33"><tr><td align="center" style="padding:28px 12px">
    <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;margin:auto;background:#ffffff;border:1px solid #dce6e1;border-top:5px solid #143e33;border-radius:14px"><tr><td style="padding:28px 30px">
      <img src="https://plotlinepo.com/assets/plotline/website/brand/logos/plotline-primary-transparent.png" width="160" alt="Plotline" style="display:block;max-width:100%;height:auto">
      <p style="margin:6px 0 24px;color:#546c62;font-size:12px;letter-spacing:.6px">${PLOTLINE_REFERENCE_TAGLINE}</p>
      ${employerHeader(agency,departmentLabel)}<h1 style="font-size:26px;line-height:1.3;color:#143e33">${escape(heading)}</h1>${body}${footer}${card}
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px"><tr><td>
        <a href="https://plotlinepo.com" style="display:inline-block;text-decoration:none"><img src="https://plotlinepo.com/assets/plotline/website/brand/logos/plotline-primary-transparent.png" width="96" alt="Plotline" style="display:block;width:96px;max-width:100%;height:auto;border:0"></a>
        <p style="margin:6px 0 0;font-size:11px;color:#546c62">${PLOTLINE_REFERENCE_TAGLINE}</p>
      </td></tr></table>
    </td></tr></table><!--[if mso]></td></tr></table><![endif]-->
  </td></tr></table>`;
}
export function brandedReferenceEmail({ agency, candidateName, referenceName, url, deadline, footer = '', reminder = false }) {
  const { color } = referenceEmployerBrand(agency);
  const name = escape(agency?.name || agency?.official_name || 'People Operations');
  const due = referenceDeadlineDate(deadline);
  return referenceEmailFrame({ agency, heading: reminder ? 'A friendly reminder' : 'Your perspective matters', body: `
      <p>Hello ${escape(referenceName || 'there')},</p><p>${name} is requesting a professional reference for <strong>${escape(candidateName)}</strong>.</p>
      <p>Would you hire this person? Share your perspective through a short questionnaire. It takes about five minutes.</p>
      <div style="padding:16px;background:#f2f5f4;border-radius:8px;"><strong>Your answers will not be shared with the applicant.</strong> Only staff with hiring permission can review your answers. We will tell the applicant that you completed their reference and identify you by name, without sharing your answers, ratings or our contact notes.</div>
      <p><strong>Please complete by ${escape(due)}.</strong></p>
      <p style="margin:28px 0;"><a href="${escape(url)}" style="display:inline-block;background:${color};color:white;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Complete the reference</a></p>
      <p style="font-size:12px;overflow-wrap:anywhere;word-break:break-all;">Or open this secure link: <a href="${escape(url)}" style="color:${color}">${escape(url)}</a></p>
      <p>Thank you for your time,<br/><strong>${name}</strong></p>`, footer });
}

export function referenceRequestsSentEmail({ agency, candidateName, references, footer = '' }) {
  const list = references.map(person => `<li style="margin:12px 0;overflow-wrap:anywhere"><strong>${escape(person.name || person.email)}</strong>${person.name ? `<br><span style="font-size:14px;color:#546c62">${escape(person.email)}</span>` : ''}</li>`).join('');
  return referenceEmailFrame({ agency, heading: 'Reference requests sent', body: `<p>Hi ${escape(candidateName)},</p>
    <p>We sent a confidential reference questionnaire to:</p><ul style="padding-left:22px">${list}</ul>
    <p>We will let you know when each reference is completed. Their answers and ratings remain private.</p>`, footer });
}
