import Directory from './googleWorkspaceDirectory.service.js';

const enabled = value => value === true || value === 1 || value === '1';
const email = value => String(value || '').trim().toLowerCase();
export function isAppOnlyProvider(user) {
  const provider = ['provider', 'provider_plus', 'clinical_practice_assistant', 'intern'].includes(String(user.role || '').toLowerCase()) || enabled(user.has_provider_access);
  return provider && enabled(user.sso_password_override) && enabled(user.login_is_group_email) && !enabled(user.is_demo);
}

const staffRoles = new Set(['admin','super_admin','support','staff','provider','provider_plus','clinical_practice_assistant','intern','intern_plus','supervisor','schedule_manager']);
export function activeMessageStaff(user) {
  return (staffRoles.has(String(user.role || '').toLowerCase()) || enabled(user.has_provider_access)) && !enabled(user.is_demo)
    && !enabled(user.is_archived) && (user.is_active == null || enabled(user.is_active))
    && (!user.status || ['ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING'].includes(String(user.status).toUpperCase()));
}
/** An enabled Workspace account never receives personal fallback. A suspended
 * Workspace account may use it only while its app staff account remains active
 * and password login has explicitly been enabled. Directory failures fail closed. */
export async function messageReminderRecipient(user, { channel = 'email', allowPersonal = true } = {}) {
  if (!activeMessageStaff(user)) return null;
  if (enabled(user.sso_password_override)) {
    if (!Directory.isConfigured()) return null;
    const login = email(user.email);
    if (!login) return null;
    let workspaceUser;
    try { workspaceUser = await Directory.getUser({ primaryEmail: login }); }
    catch (error) {
      if (Number(error.code || error.response?.status) !== 400 || !/Type not supported: userKey/i.test(String(error.message))) throw error;
    }
    if (workspaceUser && !workspaceUser.suspended) return channel !== 'email' && login !== email(user.personal_email) ? login : null;
    if (!allowPersonal || !email(user.personal_email) || email(user.personal_email) === login) return null;
    if (workspaceUser?.suspended) return email(user.personal_email);
    if (!enabled(user.login_is_group_email) || !await Directory.getGroup({ groupEmail: login })) return null;
    return email(user.personal_email);
  }
  if (channel === 'email' || enabled(user.login_is_group_email)) return null;
  return [user.email, user.work_email].map(email).find(value => value && value !== email(user.personal_email)) || null;
}

export async function personalMessageSettingsEligibility(userId) {
  const User = (await import('../models/User.model.js')).default;
  const user = await User.findById(userId);
  if (!user || !activeMessageStaff(user)) return { eligible:false, reason:'inactive_staff', personalEmail:null };
  if (!enabled(user.sso_password_override)) return { eligible:false, reason:'sso', personalEmail:null };
  if (!email(user.personal_email)) return { eligible:false, reason:'missing_personal_email', personalEmail:null };
  try {
    const recipient = await messageReminderRecipient(user);
    return { eligible:!!recipient, reason:recipient ? null : 'work_account_or_mailbox_unavailable', personalEmail:recipient };
  } catch { return { eligible:false, reason:'verification_unavailable', personalEmail:null }; }
}

export async function assertMessageReminderRecipient({ templateType, userId, to, cc, bcc }) {
  const channel = { personal_thread_reminder: 'email', personal_thread_forward: 'email', hub_secure_unread_digest: 'secure', hub_sms_unread_digest: 'sms' }[templateType];
  if (!channel) return;
  const User = (await import('../models/User.model.js')).default;
  const user = userId ? await User.findById(userId) : null;
  let allowed = user ? await messageReminderRecipient(user, { channel }) : null;
  if(allowed && allowed===email(user.personal_email)) {
    const prefs=await (await import('./inboxDigest.service.js')).getCommunicationPrefs(userId);
    if(!prefs.personalEmailNotify || (templateType==='personal_thread_forward' && prefs.personalEmailDeliveryMode!=='forward_one_to_one'))allowed=null;
  }
  const recipient = Array.isArray(to) ? (to.length === 1 ? to[0]?.email || to[0] : '') : to;
  if (!allowed || email(recipient) !== allowed || cc?.length || bcc?.length) {
    throw Object.assign(new Error('Message reminder recipient is not permitted by the current SSO/app-only policy.'), { code: 'REMINDER_RECIPIENT_POLICY', status: 400 });
  }
}
