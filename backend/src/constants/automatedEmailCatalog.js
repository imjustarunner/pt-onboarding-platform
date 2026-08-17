/**
 * Tenant outbound email types and the identity keys that count as
 * an intentional From — not a fallback.
 *
 * If a send cannot resolve to a configured identity (template map, trigger
 * sender, or one of these preferred keys), it must queue for approval.
 */

export const FALLBACK_SENDER_FLAG = {
  code: 'fallback_sender',
  message: 'This email would send from a fallback From address. Assign a tenant sender identity in Email Settings, then approve to send.'
};

export const PREFERRED_IDENTITY_KEYS_BY_TEMPLATE_TYPE = {
  password_reset: ['login_recovery', 'notifications'],
  admin_initiated_password_reset: ['login_recovery', 'notifications'],
  school_staff_account_recovery: ['login_recovery', 'notifications'],
  school_staff_portal_access: ['login_recovery', 'notifications'],
  school_roi_signing: ['school_intake', 'intake'],
  school_roi_signer_completion: ['school_intake', 'intake'],
  school_roi_release: ['school_intake', 'intake'],
  smart_school_roi: ['school_intake', 'intake'],
  intake: ['school_intake', 'intake'],
  intake_summary_pdf_copy: ['school_intake', 'intake', 'notifications'],
  co_guardian_invite: ['school_intake', 'intake', 'notifications'],
  adaptive_full_intake_invite: ['intake', 'notifications'],
  guardian_portal_login_info: ['login_recovery', 'notifications'],
  manual: ['notifications'],
  job_applications: ['job_applications', 'notifications'],
  hiring_references: ['hiring_references', 'notifications'],
  admin_update: ['notifications']
};

export function preferredIdentityKeysForTemplateType(templateType) {
  const key = String(templateType || '').trim().toLowerCase();
  if (!key) return [];
  if (PREFERRED_IDENTITY_KEYS_BY_TEMPLATE_TYPE[key]) {
    return PREFERRED_IDENTITY_KEYS_BY_TEMPLATE_TYPE[key];
  }
  if (key.startsWith('trigger:')) return [];
  return [];
}

export function identityKeyMatchesPreferred(identity, templateType) {
  const key = String(identity?.identity_key || '').trim().toLowerCase();
  if (!key) return false;
  return preferredIdentityKeysForTemplateType(templateType).includes(key);
}

export function buildFallbackSenderMetadata({
  reason = 'no_configured_sender_identity',
  fromEmail = null,
  extra = {}
} = {}) {
  return {
    usedFallbackSender: true,
    fallbackReason: reason,
    ...(fromEmail ? { fromEmail } : {}),
    qualityFlags: [FALLBACK_SENDER_FLAG],
    ...extra
  };
}
