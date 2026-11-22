import config from '../config/config.js';
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const PLOTLINE_REFERENCE_TAGLINE = 'A People Operations Platform';
export function referenceEmailFrame({ agency, heading, body, footer = '' }) {
  const name = escape(agency?.name || agency?.official_name || 'People Operations');
  return `<div style="background:#f3f0e9;padding:28px 12px;font:16px/1.65 Arial,Helvetica,sans-serif;color:#203b33"><div style="max-width:600px;margin:auto;background:white;border:1px solid #dce6e1;border-top:5px solid #143e33;border-radius:14px;overflow:hidden"><div style="padding:28px 30px"><img src="https://plotlinepo.com/assets/plotline/website/brand/logos/plotline-primary-transparent.png" width="160" alt="Plotline" style="display:block;max-width:100%;height:auto"><p style="margin:6px 0 24px;color:#546c62;font-size:12px;letter-spacing:.6px">${PLOTLINE_REFERENCE_TAGLINE}</p><p style="color:#516a60;font-size:13px;font-weight:bold">${name} · PEOPLE OPERATIONS</p><h1 style="font-size:26px;line-height:1.3;color:#143e33">${escape(heading)}</h1>${body}${footer}<div style="margin-top:28px;padding:20px;background:#f3f0e9;border:1px solid #e6e0d6;border-radius:10px"><strong style="color:#143e33">People are the heart of your organization.</strong><p style="margin:8px 0;font-size:14px">Meet Plotline — ${PLOTLINE_REFERENCE_TAGLINE}. Bring hiring, onboarding and your employee experience together.</p><a href="https://plotlinepo.com/plotline/start" style="color:#143e33;font-size:14px;font-weight:bold;text-decoration:underline">Want to use Plotline for your organization?</a></div><p style="margin:22px 0 0;font-size:12px;color:#546c62">Plotline — ${PLOTLINE_REFERENCE_TAGLINE}</p></div></div></div>`;
}
export function brandedReferenceEmail({ agency, candidateName, referenceName, url, deadline, footer = '', reminder = false }) {
  let careers = agency?.careers_page_json || {};
  if (typeof careers === 'string') { try { careers = JSON.parse(careers); } catch { careers = {}; } }
  let palette = agency?.color_palette || {};
  if (typeof palette === 'string') { try { palette = JSON.parse(palette); } catch { palette = {}; } }
  const color = [careers.accentColor, palette.primary, agency?.primary_color].find(c => /^#[a-f0-9]{6}$/i.test(c || '')) || '#176b53';
  const name = escape(agency?.name || agency?.official_name || 'People Operations');
  const logoUrl = agency?.logo_path ? `${String(config.frontendUrl || '').replace(/\/$/, '')}/uploads/${String(agency.logo_path).replace(/^\/?uploads\//, '')}` : agency?.logo_url;
  const logo = /^https:\/\//i.test(logoUrl || '') ? `<img src="${escape(logoUrl)}" alt="${name}" style="max-width:180px;max-height:64px;margin-bottom:16px;" />` : '';
  const due = new Date(deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `<div style="background:#f2f5f4;padding:32px 12px;font-family:Arial,sans-serif;color:#20352e;line-height:1.6;">
    <div style="max-width:600px;margin:auto;background:white;border:1px solid #dce6e1;border-radius:16px;overflow:hidden;">
      <div style="padding:28px 32px;border-top:8px solid ${color};"><img src="https://plotlinepo.com/assets/plotline/website/brand/logos/plotline-primary-transparent.png" width="150" alt="Plotline by PlotTwistCo" style="display:block;margin-bottom:20px;" />${logo}<div style="color:${color};font-weight:bold;">${name} · PEOPLE OPERATIONS</div>
      <h1 style="font-size:26px;line-height:1.2;">${reminder ? 'A friendly reminder' : 'Your perspective matters'}</h1>
      <p>Hello ${escape(referenceName || 'there')},</p><p>${name} is requesting a professional reference for <strong>${escape(candidateName)}</strong>.</p>
      <p>Would you hire this person? Share your perspective through a short questionnaire. It takes about five minutes.</p>
      <div style="padding:16px;background:#f2f5f4;border-radius:8px;"><strong>Your answers will not be shared with the applicant.</strong> Only staff with hiring permission can review your answers. We will tell the applicant that you completed their reference and identify you by name, without sharing your answers, ratings or our contact notes.</div>
      <p><strong>Please complete by ${escape(due)} (UTC).</strong></p>
      <p style="margin:28px 0;"><a href="${escape(url)}" style="display:inline-block;background:${color};color:white;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Complete the reference</a></p>
      <p style="font-size:12px;word-break:break-all;">Or open this secure link: ${escape(url)}</p>
      ${footer}<p>Thank you for your time,<br/><strong>${name}</strong></p><div style="padding:18px;background:#f3f0e9;border:1px solid #e6e0d6;border-radius:10px"><strong>Plotline — ${PLOTLINE_REFERENCE_TAGLINE}</strong><p style="margin:8px 0;font-size:14px">Bring hiring, onboarding and your employee experience together.</p><a href="https://plotlinepo.com/plotline/start" style="color:${color};font-size:14px;font-weight:bold">Want to use Plotline for your organization?</a></div></div></div></div>`;
}
