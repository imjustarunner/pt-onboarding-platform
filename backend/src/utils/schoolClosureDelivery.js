export const CLOSURE_DELIVERY_MODES = ['app', 'sms', 'none', 'work_email', 'work_email_forward'];
export const SCHOOL_CLOSURE_STAFF_ROLES = new Set(['admin','super_admin','support','staff','provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant','schedule_manager','facilitator','tutor','approved_employee','employee']);
const yes = value => [true, 1, '1'].includes(value);
export const normalizedEmail = value => {
  const address = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
};
export function closureEmailOptions(user = {}) {
  user ||= {};
  // The login identifies the configured Workspace user/Group. Older work_email
  // contact fields can contain a personal address and must not override it.
  const work = normalizedEmail(user.email || user.work_email);
  const nonSso = yes(user.sso_password_override) || yes(user.login_is_group_email);
  const personal = normalizedEmail(user.personal_email);
  return { work, personal, nonSso, emailMode: nonSso ? 'work_email_forward' : 'work_email',
    emailAvailable: !!work && (!nonSso || (!!personal && personal !== work)) };
}
export function closureDeliveryMode(override = {}) {
  if (CLOSURE_DELIVERY_MODES.includes(override.deliveryMode)) return override.deliveryMode;
  if (override.inApp === false && override.email !== true && override.sms !== true) return 'none';
  return 'app';
}
