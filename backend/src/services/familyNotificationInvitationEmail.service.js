import {escapePortalHtml as e} from './portalEmailBranding.service.js';
import {portalActionHtml,clientEmailLabel} from './clientPortalEmailContent.js';
export function buildFamilyNotificationInvitationEmail({firstName,agencyName,client,url}) {
  const all=`${url}?preset=all`,individual=url;
  const subject=`${agencyName}: choose your account updates`;
  const intro=`Choose how ${agencyName} keeps you updated about ${clientEmailLabel(client)}. Your family account already exists—you do not need to have logged in or set a password.`;
  const details='Get appointment and school-session notices, schedule changes, secure-message alerts, form reminders, billing updates and requests for missing insurance cards. Only updates relevant to your account are sent; Medicaid cards are not requested.';
  const consent='Review once, then confirm. Choose Email, Text, Both or Off for each type. You can change your mind at any time, and saying no will not affect services. No marketing is included.';
  const sms='Text choices are saved as requests. Texts remain off until the parent texting program, your phone number and your permission are ready. Message frequency varies; message and data rates may apply. Reply STOP to stop texts or HELP for help.';
  return {subject,linkUrl:url,text:`Hi ${firstName||'there'},\n\n${intro}\n\n${details}\n\nChoose all account updates:\n${all}\n\nChoose individually:\n${individual}\n\n${consent}\n\n${sms}\n\nThis link changes notification preferences only. It does not sign you in, enroll another guardian or change another child's settings. Requested login and security messages are separate.`,
    html:`<p>Hi ${e(firstName||'there')},</p><h2>Updates, your way</h2><p>${e(intro)}</p><p>${e(details)}</p>${portalActionHtml('Choose all account updates',all)}<p><a href="${e(individual)}" style="display:inline-block;padding:12px 18px;border:1px solid #16457c;border-radius:8px;color:#16457c;text-decoration:none;font-weight:700">Choose individually</a></p><p>${e(consent)}</p><p style="font-size:13px;color:#627187">${e(sms)}</p><p style="font-size:12px;color:#627187">This link changes notification preferences only. It does not sign you in, enroll another guardian or change another child’s settings. Requested login and security messages are separate.</p>`};
}
