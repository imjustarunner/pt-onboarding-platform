import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import UserActivityLog from '../models/UserActivityLog.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { routingDestination } from './schoolCareBridgeRouting.service.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function schoolStaffSetPasswordUrl(slug, token) {
  const safeSlug = String(slug || '').trim().toLowerCase();
  const safeToken = encodeURIComponent(String(token || '').trim());
  if (!safeSlug || !safeToken) throw new Error('A school portal and setup token are required');
  return `${routingDestination(safeSlug)}/reset-password/${safeToken}`;
}

export function schoolStaffPortalUrl(slug) {
  const safeSlug = String(slug || '').trim().toLowerCase();
  if (!safeSlug) throw new Error('A school portal is required');
  return routingDestination(safeSlug);
}

function lifetimeLabel(hours) {
  const value = Number(hours) || 168;
  return value % 24 === 0 ? `${value / 24} days` : `${value} hours`;
}

export function schoolStaffWelcomeContent({
  firstName,
  schoolName,
  isSchoolAdmin = false,
  isScheduler = false,
  accessUrl,
  portalUrl = null,
  setup = true,
  setupExpiresHours = 168,
  promoted = false,
  addedByName = null
}) {
  const url = new URL(accessUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid school portal URL');
  let portal = null;
  if (portalUrl) {
    portal = new URL(portalUrl);
    if (!['https:', 'http:'].includes(portal.protocol)) throw new Error('Invalid school portal URL');
  }
  const role = isSchoolAdmin ? 'School Admin' : isScheduler ? 'Scheduler' : 'Standard School Staff';
  const permissions = isSchoolAdmin
    ? ['Add and manage school staff accounts.', 'Assign School Admin and Scheduler permissions to school staff.', 'Manage your school’s portal information and coordinate with the care team.']
    : isScheduler
      ? ['Use the school portal and its scheduling tools to coordinate with the care team.']
      : ['Use the school portal to coordinate with the care team and view information available to your account.'];
  if (isSchoolAdmin && isScheduler) permissions.push('Use the school’s Scheduler tools.');
  if (!isSchoolAdmin) permissions.push('Staff account and permission changes are managed by your School Admin.');
  const adder = String(addedByName || '').trim();
  const intro = promoted
    ? `You are now a School Admin for ${schoolName}.`
    : adder
      ? `${adder} added you to the school portal for ${schoolName}.`
      : `Welcome! You have been added to the school portal for ${schoolName}.`;
  const roleLabel = role + (isSchoolAdmin && isScheduler ? ' + Scheduler' : '');
  const action = setup ? 'Set your password' : 'Open your school portal';
  const setupNote = setup
    ? `This invitation link expires in ${lifetimeLabel(setupExpiresHours)}. Use it to choose your own password. There is no temporary password. After that, sign in with your school email.`
    : 'Sign in using your existing account.';
  const portalText = portal && portal.href !== url.href ? `\n\nYour school portal:\n${portal.href}` : '';
  const portalHtml = portal && portal.href !== url.href
    ? `<p>Your school portal: <a href="${escape(portal.href)}" style="color:#175c50">${escape(portal.href)}</a></p>`
    : '';
  return {
    subject: promoted ? `Your School Admin access — ${schoolName}` : `Welcome to the school portal — ${schoolName}`,
    text: `Hi ${firstName || 'there'},\n\n${intro}\n\nSchool: ${schoolName}\nAccount level: ${roleLabel}\n\nYou can:\n${permissions.map(p => `• ${p}`).join('\n')}\n\n${action}:\n${url.href}${portalText}\n\n${setupNote}\n\nNeed a hand? Reply to this email and the Schools team will help.\n\nThank you for partnering with us!`,
    html: `<div style="font-family:Arial,sans-serif;color:#253b3b;line-height:1.6"><h2 style="color:#175c50">${escape(promoted ? 'Your School Admin access is ready' : 'Welcome to your school portal')}</h2><p>Hi ${escape(firstName || 'there')},</p><p>${escape(intro)}</p><div style="background:#edf6f3;border-left:4px solid #287d69;padding:16px"><strong>School:</strong> ${escape(schoolName)}<br><strong>Account level:</strong> ${escape(roleLabel)}</div><p><strong>You can:</strong></p><ul>${permissions.map(p => `<li>${escape(p)}</li>`).join('')}</ul><p style="margin:24px 0"><a href="${escape(url.href)}" style="background:#175c50;color:#fff;padding:13px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escape(action)}</a></p>${portalHtml}<p>${escape(setupNote)}</p><p>Need a hand? Reply to this email and the Schools team will help.</p><p>Thank you for partnering with us!</p></div>`
  };
}

export async function schoolNotificationIdentities(agencyId) {
  const identities = await EmailSenderIdentity.list({ agencyId, includePlatformDefaults: false, onlyActive: true });
  const sender = (identities || []).find(row => {
    const key = String(row.identity_key || '').toLowerCase();
    const email = String(row.from_email || '').trim().toLowerCase();
    return key === 'schools' && email.startsWith('schools@');
  });
  const fromEmail = String(sender?.from_email || '').trim();
  if (!sender?.id || !fromEmail) {
    throw new Error('Configure this agency’s schools@ sender before sending school account mail.');
  }
  return {
    senderIdentityId: sender.id,
    replyToOverride: fromEmail,
    fromDisplayNameOverride: 'Schools Team',
    fromEmail
  };
}

export async function recordSchoolStaffInvitationActivity({
  userId,
  agencyId = null,
  to = null,
  fromEmail = null,
  replyTo = null,
  cc = null,
  subject = null,
  deliveryStatus = 'failed',
  addedByName = null,
  addedByUserId = null,
  schoolName = null,
  schoolOrganizationId = null,
  communicationId = null,
  messageId = null,
  internetMessageId = null,
  error = null,
  source = null
} = {}) {
  const sent = deliveryStatus === 'sent';
  await UserActivityLog.logActivity({
    actionType: sent ? 'school_staff_invitation_email_sent' : 'school_staff_invitation_email_failed',
    userId: userId || null,
    agencyId: agencyId || null,
    metadata: {
      email: to || null,
      fromEmail: fromEmail || null,
      replyTo: replyTo || null,
      cc: cc || null,
      subject: subject || null,
      deliveryStatus,
      addedByName: addedByName || null,
      performedByName: addedByName || null,
      performedByUserId: addedByUserId || null,
      schoolName: schoolName || null,
      schoolOrganizationId: schoolOrganizationId || null,
      communicationId: communicationId || null,
      messageId: messageId || null,
      internetMessageId: internetMessageId || null,
      source: source || null,
      error: error ? String(error).slice(0, 300) : null
    }
  });
}

function deliveryOf(result) {
  if (result?.blocked || result?.skipped) return 'failed';
  if (result?.queued || result?.pendingApproval) return 'queued';
  if (result?.id) return 'sent';
  return 'failed';
}

export async function sendSchoolStaffWelcomeEmail({
  agencyId,
  schoolOrganizationId,
  userId,
  actorUserId,
  to,
  source = 'auto',
  addedByName = null,
  ...content
}) {
  const identities = await schoolNotificationIdentities(agencyId);
  const welcome = schoolStaffWelcomeContent({ ...content, addedByName });
  const { fromEmail, ...envelope } = identities;
  let result = null;
  let error = null;
  try {
    result = await sendEmailFromIdentity({
      ...envelope,
      ...welcome,
      to,
      source,
      userId,
      generatedByUserId: actorUserId,
      schoolOrganizationId,
      templateType: content.promoted ? 'school_staff_admin_access' : 'school_staff_welcome'
    });
  } catch (sendError) {
    error = sendError;
  }
  const deliveryStatus = error ? 'failed' : deliveryOf(result);
  try {
    await recordSchoolStaffInvitationActivity({
      userId,
      agencyId,
      to,
      fromEmail,
      replyTo: envelope.replyToOverride,
      subject: welcome.subject,
      deliveryStatus,
      addedByName,
      addedByUserId: actorUserId,
      schoolName: content.schoolName || null,
      schoolOrganizationId,
      communicationId: result?.communicationId || null,
      messageId: result?.id || null,
      internetMessageId: result?.internetMessageId || null,
      error: error?.message || (deliveryStatus === 'sent' ? null : result?.reason || null),
      source
    });
  } catch (logError) {
    console.warn('[school staff invitation] activity log failed:', logError?.message || logError);
  }
  if (error) throw error;
  return result;
}
