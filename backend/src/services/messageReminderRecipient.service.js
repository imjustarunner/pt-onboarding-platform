import Directory from './googleWorkspaceDirectory.service.js';

const enabled = value => value === true || value === 1 || value === '1';
const email = value => String(value || '').trim().toLowerCase();
export function isAppOnlyProvider(user) {
  const provider = ['provider', 'provider_plus', 'clinical_practice_assistant', 'intern'].includes(String(user.role || '').toLowerCase()) || enabled(user.has_provider_access);
  return provider && enabled(user.sso_password_override) && enabled(user.login_is_group_email) && !enabled(user.is_demo);
}

/** Personal fallback requires an explicit app-only provider AND a verified Group
 * login, never a Workspace user. Password overrides alone do not establish this.
 * Unknown configuration fails closed. SSO reminders never use personal_email.
 */
export async function messageReminderRecipient(user, { channel = 'email', allowPersonal = true } = {}) {
  if (isAppOnlyProvider(user)) {
    if (!Directory.isConfigured()) return null;
    const login = email(user.email);
    if (!login) return null;
    let workspaceUser;
    try { workspaceUser = await Directory.getUser({ primaryEmail: login }); }
    catch (error) {
      // The Directory users endpoint returns this 400 for a Group address.
      // Continue only to the positive Group verification below; other errors
      // remain failures, and no personal recipient is allowed without a Group.
      if (Number(error.code || error.response?.status) !== 400 || !/Type not supported: userKey/i.test(String(error.message))) throw error;
    }
    if (workspaceUser) return channel !== 'email' && login !== email(user.personal_email) ? login : null;
    if (!allowPersonal || !email(user.personal_email)) return null;
    if (!await Directory.getGroup({ groupEmail: login })) return null;
    return email(user.personal_email) === login ? null : email(user.personal_email);
  }
  if (channel === 'email' || enabled(user.login_is_group_email)) return null;
  // Email is the SSO login address; work_email is a secondary work-only option.
  return [user.email, user.work_email].map(email).find(value => value && value !== email(user.personal_email)) || null;
}

export async function assertMessageReminderRecipient({ templateType, userId, to, cc, bcc }) {
  const channel = { personal_thread_reminder: 'email', hub_secure_unread_digest: 'secure', hub_sms_unread_digest: 'sms' }[templateType];
  if (!channel) return;
  const User = (await import('../models/User.model.js')).default;
  const user = userId ? await User.findById(userId) : null;
  const allowed = user ? await messageReminderRecipient(user, { channel }) : null;
  const recipient = Array.isArray(to) ? (to.length === 1 ? to[0]?.email || to[0] : '') : to;
  if (!allowed || email(recipient) !== allowed || cc?.length || bcc?.length) {
    throw Object.assign(new Error('Message reminder recipient is not permitted by the current SSO/app-only policy.'), { code: 'REMINDER_RECIPIENT_POLICY', status: 400 });
  }
}
