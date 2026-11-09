import { passwordRecoverySsoState } from './passwordRecoveryPolicy.service.js';
import { usesPasswordLogin } from '../utils/passwordLogin.js';
import { isActiveTeamMember } from './conversaTeamRecipients.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { emailActionButton } from '../utils/emailActionButton.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';

const email = value => String(value || '').trim().toLowerCase();
const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const noPollingConsent = new Set(['no_phone', 'sms_opted_out', 'sms_staff_choice_off', 'sms_consent_required', 'sms_consent_review_required']);

export function staffPollWorkEmail(user, agency) {
  if (!isActiveTeamMember(user) || usesPasswordLogin(user) || !passwordRecoverySsoState(user, [agency]).ssoEnabled) return null;
  // The canonical SSO login takes precedence over a stale work_email alias.
  const address = email(user.email || user.work_email);
  return /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(address) && address !== email(user.personal_email) ? address : null;
}

export function pollEmailFallbackRecipient(user, agency, smsEligibility) {
  return noPollingConsent.has(smsEligibility?.status) ? staffPollWorkEmail(user, agency) : null;
}

export function buildStaffPollEmail({ event, agency, user }) {
  const voteUrl = `${buildPublicAppUrl(agency, `staff-polls/${Number(event.id)}`)}?agencyId=${Number(agency.id)}`;
  const optInUrl = `${buildPublicAppUrl(agency, 'dashboard')}?tab=my&my=preferences&section=prefs-enrollment#prefs-enrollment`;
  const question = event.votingConfig.question || event.title;
  const options = event.votingConfig.options || [];
  const intro = `Hi ${user.first_name || 'there'},`;
  const invitation = 'You are receiving this email because you are not enrolled in poll texts. Sign in with your work account to vote.';
  const optIn = 'Skip the extra email next time: opt in to vote by text. We promise not to spam you. Poll texts are optional, and you can reply NOPOLLS to turn off only poll texts. Review and save your enrollment preferences to opt in.';
  return {
    subject: `Team poll: ${event.title}`,
    text: `${intro}\n\n${event.title}\n${question}\n${options.map(o => `• ${o.label}`).join('\n')}\n\n${invitation}\nVote: ${voteUrl}\n\n${optIn}\nOpt in to vote by text: ${optInUrl}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><p>${esc(intro)}</p><h2>${esc(event.title)}</h2><p>${esc(question)}</p><ul>${options.map(o => `<li>${esc(o.label)}</li>`).join('')}</ul><p>${esc(invitation)}</p>${emailActionButton('Vote in this poll', voteUrl, true)}<p>${esc(optIn)}</p>${emailActionButton('Opt in to vote by text', optInUrl)}</div>`
  };
}

export async function sendStaffPollEmail({ event, agency, user, to, actorUserId }) {
  return sendNotificationEmail({ agencyId: Number(agency.id), triggerKey: 'system_email_test',
    to, ...buildStaffPollEmail({ event, agency, user }), generatedByUserId: actorUserId,
    userId: Number(user.id), templateType: 'staff_poll_invitation', templateId: Number(event.id), source: 'manual' });
}
