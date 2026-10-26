import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function schoolStaffWelcomeContent({ firstName, schoolName, isSchoolAdmin = false, isScheduler = false, accessUrl, setup = true, setupExpiresHours = 168, promoted = false }) {
  const url = new URL(accessUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid school portal URL');
  const role = isSchoolAdmin ? 'School Admin' : isScheduler ? 'Scheduler' : 'Standard School Staff';
  const permissions = isSchoolAdmin
    ? ['Add and manage school staff accounts.', 'Assign School Admin and Scheduler permissions to school staff.', 'Manage your school’s portal information and coordinate with the care team.']
    : isScheduler
      ? ['Use the school portal and its scheduling tools to coordinate with the care team.']
      : ['Use the school portal to coordinate with the care team and view information available to your account.'];
  if (isSchoolAdmin && isScheduler) permissions.push('Use the school’s Scheduler tools.');
  if (!isSchoolAdmin) permissions.push('Staff account and permission changes are managed by your School Admin.');
  const intro = promoted ? `You are now a School Admin for ${schoolName}.` : `Welcome! You have been added to the school portal for ${schoolName}.`;
  const roleLabel = role + (isSchoolAdmin && isScheduler ? ' + Scheduler' : '');
  const action = setup ? 'Set up your account' : 'Open your school portal';
  const setupNote = setup ? `Your secure setup link expires in ${setupExpiresHours % 24 === 0 ? `${setupExpiresHours / 24} days` : `${setupExpiresHours} hours`}. After setup, sign in with your school email address.` : 'Sign in using your existing account.';
  return {
    subject: promoted ? `Your School Admin access — ${schoolName}` : `Welcome to the school portal — ${schoolName}`,
    text: `Hi ${firstName || 'there'},\n\n${intro}\n\nSchool: ${schoolName}\nAccount level: ${roleLabel}\n\nYou can:\n${permissions.map(p => `• ${p}`).join('\n')}\n\n${action}:\n${url.href}\n\n${setupNote}\n\nNeed a hand? Reply to this email and our Support team will help.\n\nThank you for partnering with us!`,
    html: `<div style="font-family:Arial,sans-serif;color:#253b3b;line-height:1.6"><h2 style="color:#175c50">${escape(promoted ? 'Your School Admin access is ready' : 'Welcome to your school portal')}</h2><p>Hi ${escape(firstName || 'there')},</p><p>${escape(intro)}</p><div style="background:#edf6f3;border-left:4px solid #287d69;padding:16px"><strong>School:</strong> ${escape(schoolName)}<br><strong>Account level:</strong> ${escape(roleLabel)}</div><p><strong>You can:</strong></p><ul>${permissions.map(p => `<li>${escape(p)}</li>`).join('')}</ul><p style="margin:24px 0"><a href="${escape(url.href)}" style="background:#175c50;color:#fff;padding:13px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escape(action)}</a></p><p>${escape(setupNote)}</p><p>Need a hand? Reply to this email and our Support team will help.</p><p>Thank you for partnering with us!</p></div>`
  };
}

export async function schoolNotificationIdentities(agencyId, replyKey = 'support') {
  const identities = await EmailSenderIdentity.list({ agencyId, includePlatformDefaults: false, onlyActive: true });
  const find = key => identities.find(row => String(row.identity_key || '').toLowerCase() === key && String(row.from_email || '').toLowerCase().startsWith(`${key}@`));
  const sender = find('notifications');
  const reply = find(replyKey);
  if (!sender?.id || !reply?.from_email) throw new Error(`Configure Notifications and ${replyKey} sender identities before sending school account mail.`);
  return { senderIdentityId: sender.id, replyToOverride: reply.from_email };
}

export async function sendSchoolStaffWelcomeEmail({ agencyId, schoolOrganizationId, userId, actorUserId, to, source = 'auto', ...content }) {
  const identities = await schoolNotificationIdentities(agencyId);
  return sendEmailFromIdentity({
    ...identities, ...schoolStaffWelcomeContent(content), to, source, userId,
    generatedByUserId: actorUserId, schoolOrganizationId,
    templateType: content.promoted ? 'school_staff_admin_access' : 'school_staff_welcome'
  });
}
