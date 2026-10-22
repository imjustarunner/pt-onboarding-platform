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
  office_request_review: ['notifications'],
  office_request_decision: ['notifications'],
  password_reset: ['technology', 'login_recovery', 'notifications'],
  account_login_help: ['technology'],
  admin_initiated_password_reset: ['technology', 'login_recovery', 'notifications'],
  school_staff_account_recovery: ['technology', 'login_recovery', 'notifications'],
  school_staff_portal_access: ['technology', 'login_recovery', 'notifications'],
  school_onboarding_welcome: ['notifications'],
  school_onboarding_staff_portal_access: ['technology', 'login_recovery', 'notifications'],
  school_onboarding_login_recovery_nudge: ['technology', 'login_recovery', 'notifications'],
  school_roi_signing: ['schools'],
  school_roi_signer_completion: ['schools'],
  school_roi_release: ['schools'],
  smart_school_roi: ['schools'],
  school_enrollment_packet_status: ['school_intake', 'notifications'],
  school_visit_reminder: ['notifications', 'default_notifications'],
  school_ready_to_schedule_digest: ['school_intake', 'notifications'],
  client_renewal: ['schools', 'school_intake'],
  intake: ['school_intake', 'intake'],
  intake_summary_pdf_copy: ['school_intake', 'intake', 'notifications'],
  family_balance_due: ['billing'],
  co_guardian_invite: ['notifications'],
  adaptive_full_intake_invite: ['notifications'],
  guardian_portal_login_info: ['notifications'],
  hub_portal_invite: ['clinical_enrollment_portal', 'enrollment_portal', 'notifications'],
  guardian_plan_review: ['clinical_enrollment_portal', 'notifications'],
  session_reminder: ['clinical_appointment_reminders', 'notifications'],
  school_session_notice: ['clinical_enrollment_portal', 'clinical_appointment_reminders', 'notifications'],
  secure_message_notification: ['clinical_enrollment_portal', 'secure_message', 'notifications'],
  session_confirmation: ['clinical_appointment_reminders', 'notifications'],
  manual: ['notifications'],
  job_applications: ['people_operations', 'job_applications', 'notifications'],
  hiring_interview_invite: ['people_operations', 'job_applications', 'notifications'],
  hiring_references: ['hiring_references', 'people_operations', 'notifications'],
  enrollment_unfinished_reminder_24h: ['forms', 'intake', 'school_intake'],
  enrollment_unfinished_reminder_72h: ['forms', 'intake', 'school_intake'],
  enrollment_unfinished_reminder_7d: ['forms', 'intake', 'school_intake'],
  enrollment_unfinished_reminder: ['forms', 'intake', 'school_intake'],
  pre_hire_admin_review_access: ['people_operations', 'job_applications', 'notifications'],
  prehire_new_tasks: ['people_operations', 'job_applications', 'notifications'],
  provider_update_invite: ['people_operations', 'people_ops', 'po', 'notifications'],
  admin_update: ['notifications'],
  compliance_digest: ['compliance'],
  psychotherapy_threshold: ['compliance', 'notifications'],
  expiring_background: ['compliance', 'notifications'],
  background_check_scheduled_admin: ['compliance', 'notifications'],
  client_assigned: ['notifications', 'people_operations', 'support'],
  client_exchange_match: ['client_exchange', 'notifications'],
  client_exchange_audit: ['client_exchange', 'notifications'],
  unmonitored_mailbox_auto_reply: ['exchange_noreply', 'noreply'],
  client_terminated: ['notifications', 'people_operations', 'support'],
  client_checklist_updated: ['notifications', 'support'],
  contact_reminder_assigned: ['notifications'],
  meeting_join_reminder: ['notifications', 'support', 'technology'],
  meeting_invited: ['notifications', 'support'],
  meeting_summary_ready: ['notifications', 'support'],
  meeting_cancelled: ['notifications', 'support'],
  supervision_missed: ['notifications', 'support'],
  program_reminder: ['notifications', 'people_operations'],
  company_event_checkin: ['notifications', 'people_operations'],
  shift_calloff_need_coverage: ['notifications', 'people_operations'],
  daily_digest: ['notifications', 'people_operations']
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

/** Preferred From mailboxes for trigger-based notification sends. */
export function preferredIdentityKeysForOutboundSend({ templateType = null, triggerKey = null } = {}) {
  const fromTemplate = preferredIdentityKeysForTemplateType(templateType);
  if (fromTemplate.length) return fromTemplate;
  const fromTrigger = preferredIdentityKeysForTemplateType(triggerKey);
  if (fromTrigger.length) return fromTrigger;
  // Default: tenant notifications@ mailbox — not the platform ai@ bounce-back address.
  return ['notifications', 'default_notifications', 'support', 'people_operations'];
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
