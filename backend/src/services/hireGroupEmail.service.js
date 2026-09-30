import Directory from './googleWorkspaceDirectory.service.js';
import { ensureSendAsAlias } from './gmailSendAs.service.js';

const normalize = value => String(value || '').trim().toLowerCase();
const groupAccount = user => [true, 1, '1'].includes(user?.login_is_group_email);

/** Register only an existing Workspace group, retaining its own reply address.
 * Never report an employee's email ready while Gmail verification is pending.
 */
export async function ensureHireGroupSender({ email, displayName } = {}) {
  const address = normalize(email);
  if (!address.includes('@') || !Directory.isConfigured()) {
    throw Object.assign(new Error('Work email setup is incomplete. Configure the employee’s Google Group before activation.'), { status: 409, code: 'HIRE_GROUP_EMAIL_REQUIRED' });
  }
  if (!await Directory.getGroup({ groupEmail: address })) {
    throw Object.assign(new Error('The employee’s work email group is missing. Restore it before activation.'), { status: 409, code: 'HIRE_GROUP_EMAIL_REQUIRED' });
  }
  const result = await ensureSendAsAlias({ sendAsEmail: address, displayName, replyToAddress: address });
  if (!result.ok || normalize(result.sendAs?.sendAsEmail) !== address || result.sendAs?.verificationStatus !== 'accepted') {
    throw Object.assign(new Error('Work email sending setup is incomplete. Retry setup or activation after Gmail is available; pending address verification must finish first.'), {
      status: 503, code: 'HIRE_GROUP_SENDER_NOT_READY', retryAt: result.retryAt || null
    });
  }
  return { emailSendingReady: true, senderVerification: 'accepted' };
}

/** Existing group hires must pass the same check before ACTIVE_EMPLOYEE is saved. */
export async function ensureHireGroupEmailForActivation(user) {
  if (!groupAccount(user)) return { skipped: true };
  return ensureHireGroupSender({
    email: user.work_email || user.email,
    displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || undefined
  });
}
