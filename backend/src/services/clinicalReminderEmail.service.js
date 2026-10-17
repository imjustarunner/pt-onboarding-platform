import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { ensureSendAsAlias } from './gmailSendAs.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { enrollmentMailBrand, renderPortalEmail, escapePortalHtml } from './portalEmailBranding.service.js';

export const CLINICAL_REMINDER_ADDRESS = 'reminders@auricwell.com';
export function clinicalReminderBrand({ agency, domain }) {
  const brand = enrollmentMailBrand({ agency, domain });
  if (!brand.clinical) throw new Error('AuricWell reminders are only available to agencies using the clinical chart.');
  return { ...brand, displayName: 'AuricWell Reminders', fromEmail: CLINICAL_REMINDER_ADDRESS };
}

export function renderClinicalReminder({ brand, firstName, date, time, setting, provider, confirmUrl, rescheduleUrl, cancelUrl, preview = false }) {
  if (!brand.clinical) throw new Error('A clinical reminder requires clinical agency branding.');
  const e = escapePortalHtml;
  const safe = value => { const u = new URL(value); if (u.protocol !== 'https:') throw new Error('Reminder actions require secure URLs.'); return e(u.href); };
  const html = `<div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#6a7b90;margin-bottom:10px">APPOINTMENT REMINDER</div>
<h1 style="font-size:25px;line-height:1.25;letter-spacing:-0.5px;color:#173e6c;margin:0 0 18px">A little reminder for your day.</h1>
<p style="margin:0 0 18px">Hi ${e(firstName)},<br>Your appointment with ${e(brand.name)} is coming up. Please let us know if you can make it.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dfe7ef;border-left:3px solid #d9ad45;border-radius:6px;background:#f8fafc;margin:0 0 22px"><tr><td style="padding:18px"><div style="font-size:18px;font-weight:700;color:#173e6c">${e(date)}</div><div style="font-size:15px;margin-top:5px;color:#344c68">${e(time)}</div><div style="font-size:13px;margin-top:12px;color:#627187">${e(setting)}${provider ? `<br>${e(provider)}` : ''}</div></td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td colspan="3" style="padding-bottom:10px"><a href="${safe(confirmUrl)}" style="display:block;background:#16457c;border:1px solid #16457c;border-radius:6px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;text-align:center;padding:13px 10px">Yes, I’m attending</a></td></tr><tr><td width="49%"><a href="${safe(rescheduleUrl)}" style="display:block;border:1px solid #cbd6e3;border-radius:6px;color:#234d78;text-decoration:none;font-size:13px;text-align:center;padding:11px 6px">Request a new time</a></td><td width="2%"></td><td width="49%"><a href="${safe(cancelUrl)}" style="display:block;border:1px solid #cbd6e3;border-radius:6px;color:#526580;text-decoration:none;font-size:13px;text-align:center;padding:11px 6px">I can’t attend</a></td></tr></table>
<p style="font-size:12px;color:#627187;line-height:1.6;margin:18px 0 8px">Need help? Contact your care team at <a href="mailto:${e(brand.replyTo)}" style="color:#16457c">${e(brand.replyTo)}</a>.</p>
${preview ? '<p style="font-size:11px;color:#768496;border-top:1px solid #e6ebf1;padding-top:12px;margin-top:18px">Design preview · Sample appointment. These buttons open AuricWell and do not change a real appointment.</p>' : ''}`;
  return renderPortalEmail({ brand, html });
}

// Explicit EHR-only sender. Nonclinical and tutoring notifications continue to
// use their agency identity. Callers supply existing authorized action URLs.
export async function sendClinicalReminderEmail({ agencyId, subject, ...message }) {
  const agency = await Agency.findById(agencyId);
  const domain = await inferAgencyMailDomain(agencyId);
  if (!agency || !domain) throw new Error('Clinical reminders require an agency and its support domain.');
  const brand = clinicalReminderBrand({ agency, domain });
  const sending = await ensureSendAsAlias({ sendAsEmail: brand.fromEmail, displayName: brand.displayName, treatAsAlias: false });
  if (!sending.ok || sending.sendAs?.verificationStatus !== 'accepted') throw new Error('Clinical reminders Group is not verified for sending.');
  const identityKey = 'clinical_appointment_reminders';
  const values = { displayName: brand.displayName, fromEmail: brand.fromEmail, replyTo: brand.replyTo, isActive: true };
  let identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, identityKey);
  if (!identity) identity = await EmailSenderIdentity.create({ agencyId, identityKey, ...values, inboundAddresses: [] });
  else if (identity.from_email !== values.fromEmail || identity.display_name !== values.displayName || identity.reply_to !== values.replyTo) identity = await EmailSenderIdentity.update(identity.id, values);
  return sendEmailFromIdentity({ ...message, subject: subject.includes(brand.name) ? subject : `${brand.name}: ${subject}`, senderIdentityId: identity.id, replyToOverride: brand.replyTo });
}
