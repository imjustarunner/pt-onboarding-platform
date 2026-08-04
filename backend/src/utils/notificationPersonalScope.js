/**
 * Notification visibility rules.
 *
 * Most notifications are addressed to one user (user_id set). Only explicit agency-event
 * types may appear in managed feeds or as user_id=NULL broadcasts for other roles.
 */

/** Agency-operational events admins may see in Managed Agency even when fan-out rows target other users. */
export const MANAGED_AGENCY_EVENT_TYPES = new Set([
  'budget_expense_pending_approval',
  'client_became_current',
  'client_checklist_updated',
  'client_school_roi_completed',
  'client_school_roi_link_copied',
  'client_school_roi_link_generated',
  'client_school_roi_link_sent',
  'company_event_registration_submitted',
  'emergency_broadcast',
  'kiosk_checkin',
  'kudos_earned_admin_digest',
  'medical_records_release_submitted',
  'new_job_application_submitted',
  'new_packet_uploaded',
  'office_availability_request_pending',
  'office_schedule_biweekly_review',
  'office_schedule_coverage_flag',
  'office_schedule_drop_review_kept',
  'office_schedule_standing_review_6_weeks',
  'onboarding_completed',
  'pending_completed',
  'payroll_holiday_bonus_missing_approval',
  'presence_return_overdue_nudge',
  'presence_user_returned',
  'program_reminder',
  'provider_year_update_completed',
  'public_appointment_request_received',
  'referral_directory_pending_approval',
  'school_availability_request_pending',
  'school_collaborative_year_update_completed',
  'school_event_marketing_photo',
  'school_event_marketing_photo_missing',
  'school_portal_onboarding_completed',
  'school_primary_staff_removed',
  'sstc_club_invite_request',
  'sstc_club_member_application_pending',
  'support_ticket_created',
  'survey_completed',
  'unassigned_document_submitted',
  'user_activity_digest'
]);

/** Types that may use user_id=NULL as a true agency-wide broadcast in personal inboxes. */
export const INBOX_AGENCY_BROADCAST_TYPES = new Set([
  ...MANAGED_AGENCY_EVENT_TYPES
]);

export function normalizeNotificationType(type) {
  return String(type || '').trim().toLowerCase();
}

/** True when a row should only ever be visible to its user_id recipient. */
export function isStrictlyPersonalNotificationType(type) {
  const t = normalizeNotificationType(type);
  if (!t) return true;
  return !INBOX_AGENCY_BROADCAST_TYPES.has(t);
}

export function viewerMaySeeNotification(notification, viewerUserId, { allowManagedAgencyEvents = false } = {}) {
  const uid = Number(viewerUserId || 0);
  const ownerId = notification?.user_id == null ? null : Number(notification.user_id);
  if (ownerId == null) {
    return INBOX_AGENCY_BROADCAST_TYPES.has(normalizeNotificationType(notification?.type));
  }
  if (ownerId === uid) return true;
  if (!allowManagedAgencyEvents) return false;
  return MANAGED_AGENCY_EVENT_TYPES.has(normalizeNotificationType(notification?.type));
}

export function sqlInList(values) {
  const arr = Array.from(values || []);
  return {
    placeholders: arr.map(() => '?').join(', '),
    params: arr
  };
}
