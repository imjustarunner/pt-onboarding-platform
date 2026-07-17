const CATEGORY_DEFINITIONS = {
  account_security: { label: 'Account & Security', icon: '🛡️', color: '#7c3aed' },
  user_activity: { label: 'User Activity', icon: '👤', color: '#0284c7' },
  tasks_messaging: { label: 'Tasks & Messaging', icon: '💬', color: '#ea580c' },
  clients_documents: { label: 'Clients & Documents', icon: '📁', color: '#0891b2' },
  scheduling_office: { label: 'Scheduling & Office', icon: '📅', color: '#2563eb' },
  events_registration: { label: 'Events & Registration', icon: '🎟️', color: '#c2410c' },
  payroll_billing: { label: 'Payroll & Billing', icon: '💳', color: '#0f766e' },
  onboarding_hiring: { label: 'Onboarding & Hiring', icon: '🤝', color: '#9333ea' },
  supervision_programs: { label: 'Supervision & Programs', icon: '🎯', color: '#4f46e5' },
  recognition_announcements: { label: 'Recognition & Announcements', icon: '📣', color: '#ca8a04' }
};

const TYPES_BY_CATEGORY = {
  account_security: [
    'status_expired', 'temp_password_expired', 'invitation_expired', 'first_login_pending',
    'first_login', 'password_changed', 'passwordless_token_expired', 'credential_expiring',
    'credential_expired_blocking', 'emergency_broadcast', 'school_primary_password_reset_sent'
  ],
  user_activity: ['user_login', 'user_logout', 'presence_return_overdue_nudge'],
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
    'kudos_earned_admin_digest', 'survey_completed', 'agency_campaign_opt_out',
    'user_activity_digest'
  ]
};

const LABEL_OVERRIDES = {
  user_login: 'User logged in',
  user_logout: 'User logged out',
  user_activity_digest: 'User activity digest',
  status_expired: 'Status expired',
  new_packet_uploaded: 'New packet uploaded',
  company_event_registration_submitted: 'New event registration',
  payroll_unpaid_notes_2_periods_old: 'Payroll notes require attention',
  payroll_unsigned_draft_notes: 'Unsigned draft notes',
  office_schedule_booking_confirm_6_weeks: 'Office booking confirmation',
  support_safety_net_alert: 'Support safety net alert',
  sstc_club_member_application_pending: 'Club member application pending',
  sstc_club_invite_request: 'Club invite request'
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
  'sstc_club_member_application_pending', 'sstc_club_invite_request'
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
    NOTIFICATION_CATALOG[type] = Object.freeze({
      type,
      label: LABEL_OVERRIDES[type] || humanize(type),
      category,
      categoryLabel: CATEGORY_DEFINITIONS[category].label,
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
        toast: required,
        sound: required,
        digest: true,
        push: PUSH_CAPABLE.has(type),
        email: true,
        sms: SMS_CAPABLE.has(type),
        toastDurationMode: required ? 'dismissable' : 'timed',
        toastDurationSeconds: required ? null : 8
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
