const CATEGORY_DEFINITIONS = {
  account_security: { label: 'Account & Security', description: 'Access, credentials, and urgent safety alerts.', icon: '🛡️', color: '#7c3aed' },
  user_activity: { label: 'User Activity', description: 'Relevant account and workforce activity.', icon: '👤', color: '#0284c7' },
  tasks_messaging: { label: 'Tasks & Messaging', description: 'Assignments, conversations, and support updates.', icon: '💬', color: '#ea580c' },
  clients_documents: { label: 'Clients & Documents', description: 'Updates for clients you manage or support.', icon: '📁', color: '#0891b2' },
  scheduling_office: { label: 'Scheduling & Office', description: 'Appointments, availability, rooms, and coverage.', icon: '📅', color: '#2563eb' },
  events_registration: { label: 'Events & Registration', description: 'Assigned events, registrations, and event messages.', icon: '🎟️', color: '#c2410c' },
  payroll_billing: { label: 'Payroll & Billing', description: 'Claims, notes, payroll, expenses, and billing.', icon: '💳', color: '#0f766e' },
  onboarding_hiring: { label: 'Onboarding & Hiring', description: 'Hiring, pre-hire, and onboarding workflows.', icon: '🤝', color: '#9333ea' },
  supervision_programs: { label: 'Supervision & Programs', description: 'Supervision milestones, programs, and clubs.', icon: '🎯', color: '#4f46e5' },
  recognition_announcements: { label: 'Recognition & Announcements', description: 'Kudos, surveys, milestones, and company news.', icon: '📣', color: '#ca8a04' },
  marketing: { label: 'Marketing', description: 'Event photos and other marketing assets from the field.', icon: '📷', color: '#db2777' }
};

const TYPES_BY_CATEGORY = {
  account_security: [
    'status_expired', 'temp_password_expired', 'invitation_expired', 'first_login_pending',
    'first_login', 'password_changed', 'passwordless_token_expired', 'credential_expiring',
    'credential_expired_blocking', 'emergency_broadcast', 'school_primary_password_reset_sent'
  ],
  user_activity: [
    'user_login', 'user_logout', 'presence_return_overdue_nudge',
    'presence_user_returned', 'user_activity_digest'
  ],
  tasks_messaging: [
    'task_overdue', 'inbound_client_message', 'support_safety_net_alert', 'client_note',
    'chat_message', 'task_comment_mention', 'support_ticket_created',
    'support_ticket_forwarded_to_provider', 'referral_directory_pending_approval',
    'voicemail_received'
  ],
  clients_documents: [
    'paperwork_received', 'new_packet_uploaded', 'client_became_current',
    'client_checklist_updated', 'client_terminated', 'client_assigned',
    'client_school_roi_link_generated', 'client_school_roi_link_copied',
    'client_school_roi_link_sent', 'client_school_roi_completed',
    'client_school_roi_provider_reminder', 'unassigned_document_submitted',
    'medical_records_release_submitted', 'psychotherapy_threshold_exceeded'
  ],
  scheduling_office: [
    'kiosk_checkin', 'office_schedule_biweekly_review',
    'office_schedule_booking_confirm_6_weeks', 'office_schedule_unbooked_forfeit',
    'office_schedule_booked_no_external_calendar_2_weeks',
    'office_schedule_booked_reverted_no_tn', 'office_schedule_slot_rescheduled',
    'office_schedule_coverage_flag', 'office_schedule_drop_review_kept',
    'office_schedule_standing_review_6_weeks', 'office_availability_request_pending',
    'office_availability_request_approved', 'school_availability_request_pending',
    'school_availability_request_approved', 'school_availability_request_denied',
    'school_provider_availability_confirmed', 'school_provider_availability_updated',
    'school_provider_slot_verification_requested',
    'school_provider_slot_verification_completed', 'facilitator_availability_push',
    'school_primary_staff_removed', 'public_appointment_request_received',
    'shift_calloff_need_coverage'
  ],
  events_registration: [
    'company_event_registration_submitted', 'company_event_message'
  ],
  payroll_billing: [
    'mileage_claim_approved', 'mileage_claim_rejected', 'mileage_claim_returned',
    'medcancel_claim_approved', 'medcancel_claim_rejected', 'medcancel_claim_returned',
    'payroll_unpaid_notes_2_periods_old', 'payroll_missing_notes_reminder',
    'payroll_unsigned_draft_notes', 'payroll_direct_indirect_ratio_alert',
    'payroll_home_address_updated', 'budget_expense_pending_approval',
    'payroll_holiday_bonus_missing_approval'
  ],
  onboarding_hiring: [
    'onboarding_completed', 'pending_completed', 'checklist_incomplete',
    'background_check_reimbursement_due', 'background_check_renewal_due',
    'new_job_application_submitted', 'hiring_task_assigned'
  ],
  supervision_programs: [
    'supervision_individual_50_reached', 'supervision_total_100_reached',
    'supervision_supervisee_completed', 'supervision_presenter_reminder',
    'program_reminder',
    'sstc_club_member_application_pending', 'sstc_club_invite_request'
  ],
  recognition_announcements: [
    'birthday_announcement', 'anniversary_announcement', 'kudos_received',
    'kudos_earned_admin_digest', 'survey_completed', 'agency_campaign_opt_out'
  ],
  marketing: [
    'school_event_marketing_photo',
    'school_event_marketing_photo_missing'
  ]
};

const LABEL_OVERRIDES = {
  user_login: 'User logged in',
  user_logout: 'User logged out',
  presence_user_returned: 'Teammate is back',
  user_activity_digest: 'User activity digest',
  status_expired: 'Status expired',
  new_packet_uploaded: 'New packet uploaded',
  company_event_registration_submitted: 'New event registration',
  payroll_unpaid_notes_2_periods_old: 'Payroll notes require attention',
  payroll_unsigned_draft_notes: 'Unsigned draft notes',
  office_schedule_booking_confirm_6_weeks: 'Office booking confirmation',
  support_safety_net_alert: 'Support safety net alert',
  sstc_club_member_application_pending: 'Club member application pending',
  sstc_club_invite_request: 'Club invite request',
  temp_password_expired: 'Temporary password expired',
  first_login_pending: 'Pending user first login',
  first_login: 'User first login',
  credential_expired_blocking: 'Credential expired — access blocked',
  school_primary_password_reset_sent: 'School password reset sent',
  school_event_marketing_photo: 'School event photo',
  school_event_marketing_photo_missing: 'School event photo not provided',
  presence_return_overdue_nudge: 'Return status overdue',
  task_comment_mention: 'Mentioned in a task comment',
  support_ticket_forwarded_to_provider: 'Support ticket forwarded to you',
  referral_directory_pending_approval: 'Referral entry needs approval',
  client_school_roi_link_generated: 'School ROI link generated',
  client_school_roi_link_copied: 'School ROI link copied',
  client_school_roi_link_sent: 'School ROI link sent',
  client_school_roi_completed: 'School ROI completed',
  client_school_roi_provider_reminder: 'School ROI reminder',
  psychotherapy_threshold_exceeded: 'Psychotherapy threshold exceeded',
  office_schedule_unbooked_forfeit: 'Unbooked office time forfeited',
  office_schedule_booked_no_external_calendar_2_weeks: 'Booking missing from external calendar',
  office_schedule_booked_reverted_no_tn: 'Booking reverted — treatment note missing',
  office_schedule_drop_review_kept: 'Dropped booking retained after review',
  office_schedule_standing_review_6_weeks: 'Standing booking review',
  school_provider_slot_verification_requested: 'School slot verification requested',
  school_provider_slot_verification_completed: 'School slot verification completed',
  facilitator_availability_push: 'Facilitator availability requested',
  shift_calloff_need_coverage: 'Shift coverage needed',
  medcancel_claim_approved: 'Medical cancellation claim approved',
  medcancel_claim_rejected: 'Medical cancellation claim rejected',
  medcancel_claim_returned: 'Medical cancellation claim returned',
  payroll_missing_notes_reminder: 'Missing payroll notes',
  payroll_direct_indirect_ratio_alert: 'Direct/indirect ratio alert',
  budget_expense_pending_approval: 'Expense needs approval',
  payroll_holiday_bonus_missing_approval: 'Holiday bonus needs approval',
  background_check_reimbursement_due: 'Background-check reimbursement due',
  background_check_renewal_due: 'Background-check renewal due',
  supervision_individual_50_reached: 'Individual supervision 50% milestone',
  supervision_total_100_reached: 'Supervision requirement completed',
  supervision_supervisee_completed: 'Supervisee completed supervision',
  kudos_earned_admin_digest: 'Kudos administrative digest',
  agency_campaign_opt_out: 'Campaign opt-out'
};

const WORKFORCE_RELEVANT = new Set([
  'temp_password_expired', 'invitation_expired', 'password_changed',
  'passwordless_token_expired', 'credential_expiring', 'credential_expired_blocking',
  'emergency_broadcast', 'presence_return_overdue_nudge', 'task_overdue',
  'chat_message', 'task_comment_mention', 'voicemail_received',
  'facilitator_availability_push', 'shift_calloff_need_coverage',
  'mileage_claim_approved', 'mileage_claim_rejected', 'mileage_claim_returned',
  'medcancel_claim_approved', 'medcancel_claim_rejected', 'medcancel_claim_returned',
  'payroll_home_address_updated', 'checklist_incomplete',
  'background_check_reimbursement_due', 'background_check_renewal_due',
  'hiring_task_assigned', 'supervision_presenter_reminder', 'program_reminder',
  'birthday_announcement', 'anniversary_announcement', 'kudos_received',
  'survey_completed', 'agency_campaign_opt_out'
]);

const PROVIDER_RELEVANT = new Set([
  ...WORKFORCE_RELEVANT,
  'inbound_client_message', 'client_note', 'support_ticket_forwarded_to_provider',
  'paperwork_received', 'client_became_current', 'client_checklist_updated',
  'client_terminated', 'client_assigned', 'client_school_roi_link_sent',
  'client_school_roi_completed', 'client_school_roi_provider_reminder',
  'medical_records_release_submitted', 'psychotherapy_threshold_exceeded', 'kiosk_checkin',
  'office_schedule_biweekly_review', 'office_schedule_booking_confirm_6_weeks',
  'office_schedule_unbooked_forfeit', 'office_schedule_booked_no_external_calendar_2_weeks',
  'office_schedule_booked_reverted_no_tn', 'office_schedule_slot_rescheduled',
  'office_schedule_drop_review_kept', 'office_schedule_standing_review_6_weeks',
  'office_availability_request_approved', 'school_availability_request_approved',
  'school_availability_request_denied', 'school_provider_availability_confirmed',
  'school_provider_availability_updated', 'school_provider_slot_verification_requested',
  'school_provider_slot_verification_completed', 'public_appointment_request_received',
  'company_event_registration_submitted', 'company_event_message',
  'payroll_unpaid_notes_2_periods_old', 'payroll_missing_notes_reminder',
  'payroll_unsigned_draft_notes', 'payroll_direct_indirect_ratio_alert',
  'supervision_individual_50_reached', 'supervision_total_100_reached',
  'supervision_supervisee_completed', 'sstc_club_member_application_pending',
  'sstc_club_invite_request'
]);

const SCHOOL_RELEVANT = new Set([
  ...WORKFORCE_RELEVANT,
  'inbound_client_message', 'client_note', 'paperwork_received',
  'client_became_current', 'client_checklist_updated', 'client_terminated',
  'client_school_roi_link_generated', 'client_school_roi_link_copied',
  'client_school_roi_link_sent', 'client_school_roi_completed',
  'school_availability_request_pending', 'school_availability_request_approved',
  'school_availability_request_denied', 'school_provider_availability_confirmed',
  'school_provider_availability_updated', 'school_provider_slot_verification_requested',
  'school_provider_slot_verification_completed', 'school_primary_staff_removed',
  'company_event_message', 'school_primary_password_reset_sent'
]);

const MANAGER_RELEVANT = new Set([
  ...PROVIDER_RELEVANT,
  'status_expired', 'first_login_pending', 'first_login', 'user_activity_digest',
  'presence_user_returned', 'support_safety_net_alert', 'support_ticket_created',
  'referral_directory_pending_approval', 'new_packet_uploaded',
  'unassigned_document_submitted', 'medical_records_release_submitted',
  'office_schedule_coverage_flag', 'office_availability_request_pending',
  'school_availability_request_pending', 'school_primary_staff_removed',
  'budget_expense_pending_approval', 'payroll_holiday_bonus_missing_approval',
  'onboarding_completed', 'pending_completed', 'new_job_application_submitted',
  'kudos_earned_admin_digest'
]);

const OPERATIONS_RELEVANT = new Set([
  ...MANAGER_RELEVANT,
  'paperwork_received', 'client_school_roi_link_generated',
  'client_school_roi_link_copied', 'company_event_registration_submitted',
  'school_event_marketing_photo', 'school_event_marketing_photo_missing'
]);

const GUARDIAN_RELEVANT = new Set([
  'emergency_broadcast', 'program_reminder', 'paperwork_received',
  'new_packet_uploaded', 'client_checklist_updated'
]);

// Relevance controls which settings a role may use. Essentials are the much
// smaller subset enabled when a user has not made an explicit per-type choice.
// Optional relevant types remain available in settings, but start off.
const WORKFORCE_ESSENTIAL = new Set([
  'temp_password_expired', 'invitation_expired', 'password_changed',
  'passwordless_token_expired', 'credential_expiring', 'credential_expired_blocking',
  'emergency_broadcast', 'task_overdue', 'chat_message', 'task_comment_mention',
  'voicemail_received', 'mileage_claim_rejected', 'mileage_claim_returned',
  'medcancel_claim_rejected', 'medcancel_claim_returned', 'checklist_incomplete',
  'hiring_task_assigned', 'program_reminder'
]);

const PROVIDER_ESSENTIAL = new Set([
  ...WORKFORCE_ESSENTIAL,
  'inbound_client_message', 'support_ticket_forwarded_to_provider',
  'paperwork_received', 'client_terminated', 'client_assigned',
  'medical_records_release_submitted', 'psychotherapy_threshold_exceeded',
  'office_schedule_unbooked_forfeit', 'office_schedule_booked_reverted_no_tn',
  'office_schedule_slot_rescheduled', 'office_availability_request_approved',
  'school_availability_request_approved', 'school_availability_request_denied',
  'school_provider_slot_verification_requested', 'public_appointment_request_received',
  'payroll_unpaid_notes_2_periods_old', 'payroll_missing_notes_reminder',
  'payroll_unsigned_draft_notes', 'supervision_presenter_reminder'
]);

const SCHOOL_ESSENTIAL = new Set([
  ...WORKFORCE_ESSENTIAL,
  'inbound_client_message', 'client_school_roi_completed',
  'school_availability_request_pending', 'school_provider_slot_verification_requested',
  'school_primary_staff_removed', 'company_event_message',
  'school_primary_password_reset_sent'
]);

const MANAGER_ESSENTIAL = new Set([
  ...PROVIDER_ESSENTIAL,
  'status_expired', 'first_login_pending', 'support_ticket_created',
  'referral_directory_pending_approval', 'new_packet_uploaded',
  'unassigned_document_submitted', 'office_schedule_coverage_flag',
  'office_availability_request_pending', 'school_availability_request_pending',
  'budget_expense_pending_approval', 'payroll_holiday_bonus_missing_approval',
  'new_job_application_submitted'
]);

const OPERATIONS_ESSENTIAL = new Set([
  ...WORKFORCE_ESSENTIAL,
  'support_ticket_created', 'referral_directory_pending_approval',
  'new_packet_uploaded', 'unassigned_document_submitted',
  'medical_records_release_submitted', 'office_schedule_coverage_flag',
  'office_availability_request_pending', 'school_availability_request_pending',
  'company_event_registration_submitted', 'budget_expense_pending_approval',
  'payroll_holiday_bonus_missing_approval', 'new_job_application_submitted'
]);

const ADMINISTRATIVE_ESSENTIAL = new Set([
  ...OPERATIONS_ESSENTIAL,
  'status_expired', 'first_login_pending', 'user_activity_digest',
  'school_event_marketing_photo', 'school_event_marketing_photo_missing'
]);

export function notificationRoleProfile(role) {
  const value = String(role || '').trim().toLowerCase();
  if (['super_admin', 'superadmin', 'admin', 'agency_admin'].includes(value)) return 'administrative';
  if (value === 'support') return 'support';
  if (['clinical_practice_assistant', 'provider_plus', 'supervisor'].includes(value)) return 'manager';
  if (['staff', 'assistant_admin'].includes(value)) return 'operations';
  if (value === 'school_staff') return 'school';
  if (['provider', 'clinician', 'therapist', 'intern', 'facilitator', 'qbha'].includes(value)) return 'provider';
  if (['client_guardian', 'guardian', 'client', 'student'].includes(value)) return 'guardian';
  return 'employee';
}

export function isNotificationRecommendedForRole(type, role) {
  const normalizedType = String(type || '').trim();
  if (normalizedType === 'emergency_broadcast' || normalizedType === 'credential_expired_blocking') return true;
  const profile = notificationRoleProfile(role);
  if (profile === 'administrative' || profile === 'support') return true;
  if (profile === 'manager') return MANAGER_RELEVANT.has(normalizedType);
  if (profile === 'operations') return OPERATIONS_RELEVANT.has(normalizedType);
  if (profile === 'provider') return PROVIDER_RELEVANT.has(normalizedType);
  if (profile === 'school') return SCHOOL_RELEVANT.has(normalizedType);
  if (profile === 'guardian') return GUARDIAN_RELEVANT.has(normalizedType);
  return WORKFORCE_RELEVANT.has(normalizedType);
}

export function isNotificationEssentialForRole(type, role) {
  const normalizedType = String(type || '').trim();
  if (normalizedType === 'emergency_broadcast' || normalizedType === 'credential_expired_blocking') return true;
  const profile = notificationRoleProfile(role);
  if (profile === 'support' && normalizedType === 'support_safety_net_alert') return true;
  if (profile === 'administrative' || profile === 'support') return ADMINISTRATIVE_ESSENTIAL.has(normalizedType);
  if (profile === 'manager') return MANAGER_ESSENTIAL.has(normalizedType);
  if (profile === 'operations') return OPERATIONS_ESSENTIAL.has(normalizedType);
  if (profile === 'provider') return PROVIDER_ESSENTIAL.has(normalizedType);
  if (profile === 'school') return SCHOOL_ESSENTIAL.has(normalizedType);
  if (profile === 'guardian') return GUARDIAN_RELEVANT.has(normalizedType);
  return WORKFORCE_ESSENTIAL.has(normalizedType);
}

/** Per-type default overrides (toast on + 5 min for presence return alerts). */
const DEFAULT_OVERRIDES_BY_TYPE = {
  presence_user_returned: {
    toast: true,
    toastDurationMode: 'timed',
    toastDurationSeconds: 300
  }
};

const LEGACY_CATEGORY_BY_TYPE = {
  inbound_client_message: 'messaging_new_inbound_client_text',
  support_safety_net_alert: 'messaging_support_safety_net_alerts',
  chat_message: 'messaging_replies_to_my_messages',
  client_note: 'messaging_client_notes',
  client_assigned: 'client_assignments',
  paperwork_received: 'clients_new_intakes',
  new_packet_uploaded: 'clients_new_intakes',
  company_event_registration_submitted: 'clients_new_intakes',
  client_checklist_updated: 'clients_checklist_updates',
  client_became_current: 'clients_checklist_updates',
  program_reminder: 'program_reminders',
  office_availability_request_approved: 'scheduling_room_booking_approved_denied',
  school_availability_request_approved: 'scheduling_room_booking_approved_denied',
  school_availability_request_denied: 'scheduling_room_booking_approved_denied',
  school_availability_request_pending: 'scheduling_schedule_changes',
  school_provider_availability_confirmed: 'school_portal_provider_slots',
  school_provider_availability_updated: 'school_portal_provider_slots',
  school_provider_slot_verification_requested: 'school_portal_provider_slots',
  school_provider_slot_verification_completed: 'school_portal_provider_slots',
  credential_expiring: 'compliance_credential_expiration_reminders',
  credential_expired_blocking: 'compliance_access_restriction_warnings',
  kiosk_checkin: 'surveys_client_checked_in',
  survey_completed: 'surveys_survey_completed',
  emergency_broadcast: 'system_emergency_broadcasts'
};

const SMS_CAPABLE = new Set([
  'inbound_client_message', 'support_safety_net_alert', 'client_note', 'kiosk_checkin',
  'survey_completed', 'credential_expiring', 'credential_expired_blocking',
  'program_reminder', 'client_assigned', 'shift_calloff_need_coverage',
  'school_provider_slot_verification_requested'
]);

const PUSH_CAPABLE = new Set([
  ...SMS_CAPABLE,
  'new_packet_uploaded', 'hiring_task_assigned', 'task_comment_mention',
  'sstc_club_member_application_pending', 'sstc_club_invite_request',
  'school_event_marketing_photo', 'school_event_marketing_photo_missing'
]);

function humanize(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const NOTIFICATION_CATALOG = {};
for (const [category, types] of Object.entries(TYPES_BY_CATEGORY)) {
  for (const type of types) {
    const digestOnly = type === 'user_login' || type === 'user_logout';
    const required = type === 'emergency_broadcast' || type === 'credential_expired_blocking';
    const defaultOverrides = DEFAULT_OVERRIDES_BY_TYPE[type] || {};
    NOTIFICATION_CATALOG[type] = Object.freeze({
      type,
      label: LABEL_OVERRIDES[type] || humanize(type),
      category,
      categoryLabel: CATEGORY_DEFINITIONS[category].label,
      categoryDescription: CATEGORY_DEFINITIONS[category].description,
      icon: CATEGORY_DEFINITIONS[category].icon,
      color: CATEGORY_DEFINITIONS[category].color,
      legacyCategoryKey: LEGACY_CATEGORY_BY_TYPE[type] || null,
      required,
      digestOnly,
      capabilities: Object.freeze({
        inApp: true,
        toast: true,
        sound: true,
        digest: true,
        push: PUSH_CAPABLE.has(type),
        email: true,
        sms: SMS_CAPABLE.has(type)
      }),
      defaults: Object.freeze({
        inApp: !digestOnly,
        toast: defaultOverrides.toast ?? required,
        sound: defaultOverrides.sound ?? required,
        digest: false,
        push: required && PUSH_CAPABLE.has(type),
        email: required,
        sms: required && SMS_CAPABLE.has(type),
        toastDurationMode:
          defaultOverrides.toastDurationMode ?? (required ? 'dismissable' : 'timed'),
        toastDurationSeconds:
          defaultOverrides.toastDurationSeconds ?? (required ? null : 8)
      })
    });
  }
}

export const NOTIFICATION_CATEGORIES = Object.freeze(CATEGORY_DEFINITIONS);
export const NOTIFICATION_TYPES = Object.freeze(Object.keys(NOTIFICATION_CATALOG));
export const getNotificationCatalogEntry = (type) => NOTIFICATION_CATALOG[String(type || '').trim()] || null;
export const listNotificationCatalog = () => NOTIFICATION_TYPES.map((type) => NOTIFICATION_CATALOG[type]);
export const isNotificationType = (type) => !!getNotificationCatalogEntry(type);

export default Object.freeze(NOTIFICATION_CATALOG);
