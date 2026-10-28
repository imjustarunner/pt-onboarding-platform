// These templates represent a specific account-access request, not routine outreach.
export const REQUESTED_ACCOUNT_EMAIL_TYPES = new Set([
  'password_reset', 'admin_initiated_password_reset', 'account_login_help',
  'school_staff_account_recovery', 'guardian_portal_login_info', 'auricwell_account_recovery'
]);
export const isRequestedAccountEmail = type => REQUESTED_ACCOUNT_EMAIL_TYPES.has(String(type || '').replace(/^trigger:/, '').toLowerCase());
