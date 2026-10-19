export const SECURITY_NOTIFICATION_TYPES = ['security_password_changed', 'security_quick_view_changed'];

export function isCredentialSecurityNotice(identity, templateType) {
  return identity?.identity_key === 'security' && SECURITY_NOTIFICATION_TYPES.includes(templateType);
}
