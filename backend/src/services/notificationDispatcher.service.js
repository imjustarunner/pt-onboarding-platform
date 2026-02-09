import Notification from '../models/Notification.model.js';
import User from '../models/User.model.js';
import UserPreferences from '../models/UserPreferences.model.js';
import NotificationGatekeeperService from './notificationGatekeeper.service.js';
import TwilioService from './twilio.service.js';
import NotificationSmsLog from '../models/NotificationSmsLog.model.js';
import AgencyNotificationPreferences from '../models/AgencyNotificationPreferences.model.js';

const SMS_CATEGORY_BY_TYPE = {
  inbound_client_message: 'messaging_new_inbound_client_text',
  support_safety_net_alert: 'messaging_support_safety_net_alerts',
  client_note: 'messaging_client_notes',
  kiosk_checkin: 'surveys_client_checked_in',
  survey_completed: 'surveys_survey_completed',
  credential_expiring: 'compliance_credential_expiration_reminders',
  credential_expired_blocking: 'compliance_access_restriction_warnings',
  program_reminder: 'program_reminders'
};

function parseJsonMaybe(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

async function resolveNotificationCategories({ userId, agencyId }) {
  const prefs = await UserPreferences.findByUserId(userId);
  let categories = parseJsonMaybe(prefs?.notification_categories) || {};
  try {
    const fallbackDefaults = {
      messaging_new_inbound_client_text: false,
      messaging_support_safety_net_alerts: false,
      messaging_replies_to_my_messages: false,
      messaging_client_notes: false,
      school_portal_client_updates: false,
      school_portal_client_update_org_swaps: false,
      school_portal_client_comments: false,
      school_portal_client_messages: false,
      scheduling_room_booking_approved_denied: false,
      scheduling_schedule_changes: false,
      scheduling_room_release_requests: false,
      compliance_credential_expiration_reminders: false,
      compliance_access_restriction_warnings: false,
      compliance_payroll_document_availability: false,
      surveys_client_checked_in: false,
      surveys_survey_completed: false,
      system_emergency_broadcasts: true,
      system_org_announcements: false,
      program_reminders: false
    };
    const agencyPrefs = agencyId ? await AgencyNotificationPreferences.getByAgencyId(agencyId) : null;
    const defaults = agencyPrefs?.defaults || fallbackDefaults;
    const enforce = agencyPrefs ? agencyPrefs.enforceDefaults === true : true;
    const hasAnyCategories = Object.keys(categories || {}).length > 0;
    if (defaults && (enforce || !hasAnyCategories)) {
      categories = { ...defaults };
    }
  } catch {
    // best effort
  }
  return categories;
}

function pickUserSmsNumber(user) {
  return user?.personal_phone || user?.work_phone || user?.phone_number || null;
}

function buildSmsBody({ title, message }) {
  const t = String(title || '').trim();
  const m = String(message || '').trim();
  const combined = t && m ? `${t}: ${m}` : (t || m);
  // Keep reasonably short to avoid multi-segment surprises.
  return combined.length > 480 ? combined.slice(0, 477) + '...' : combined;
}

class NotificationDispatcherService {
  /**
   * Create an in-app notification and (optionally) dispatch SMS based on preferences/gatekeeper.
   */
  static async createNotificationAndDispatch(notificationData, { context = {} } = {}) {
    const created = await Notification.create(notificationData);
    await this.dispatchForNotification(created, { context }).catch(() => {});
    return created;
  }

  /**
   * Dispatch channels for an existing notification record.
   * Currently: SMS only (in-app is already created).
   */
  static async dispatchForNotification(notification, { context = {} } = {}) {
    if (!notification) return { dispatched: false, reason: 'missing_notification' };

    // Map notification type -> preference category (allowlist)
    const categoryKey = SMS_CATEGORY_BY_TYPE[notification.type] || null;
    if (!categoryKey) return { dispatched: false, reason: 'type_not_allowlisted' };

    // Emergency broadcasts are handled elsewhere (broadcast system); do not duplicate.
    if (notification.type === 'emergency_broadcast') {
      return { dispatched: false, reason: 'handled_elsewhere' };
    }

    const userId = notification.user_id;
    const agencyId = notification.agency_id;
    if (!userId || !agencyId) return { dispatched: false, reason: 'missing_user_or_agency' };

    const user = await User.findById(userId);
    if (!user) return { dispatched: false, reason: 'user_not_found' };

    // Never send SMS to non-employee records (defensive; users table includes all portal users).
    // We treat only staff-like roles as eligible for SMS notifications.
    const eligibleRoles = new Set([
      'admin',
      'super_admin',
      'support',
      'supervisor',
      'clinical_practice_assistant',
      'staff',
      'provider',
      'school_staff',
      // 'clinician', // legacy (removed)
      'facilitator',
      'intern'
    ]);
    if (!eligibleRoles.has(user.role)) return { dispatched: false, reason: 'role_not_eligible' };

    // Category toggle check (defaults to ON if missing).
    const categories = await resolveNotificationCategories({ userId, agencyId });
    const categoryEnabled = categories[categoryKey];
    if (categoryEnabled === false) return { dispatched: false, reason: 'category_disabled' };

    const toRaw = pickUserSmsNumber(user);
    const to = User.normalizePhone(toRaw);
    if (!to) {
      await NotificationSmsLog.create({
        userId,
        agencyId,
        notificationId: notification.id,
        toNumber: String(toRaw || ''),
        fromNumber: '',
        body: buildSmsBody({ title: notification.title, message: notification.message }),
        status: 'failed',
        errorMessage: 'Missing/invalid user phone number'
      });
      return { dispatched: false, reason: 'missing_phone' };
    }

    const from = process.env.TWILIO_NOTIFICATIONS_FROM || process.env.TWILIO_DEFAULT_FROM;
    if (!from) {
      await NotificationSmsLog.create({
        userId,
        agencyId,
        notificationId: notification.id,
        toNumber: to,
        fromNumber: '',
        body: buildSmsBody({ title: notification.title, message: notification.message }),
        status: 'failed',
        errorMessage: 'Missing TWILIO_NOTIFICATIONS_FROM (or TWILIO_DEFAULT_FROM)'
      });
      return { dispatched: false, reason: 'missing_from_number' };
    }

    const decisionContext = {
      severity: notification.severity || context.severity,
      isEmergencyBroadcast: context.isEmergencyBroadcast === true,
      isBlockingCompliance: context.isBlockingCompliance === true || notification.type === 'credential_expired_blocking',
      isUrgent: context.isUrgent === true || notification.severity === 'urgent'
    };

    const decision = await NotificationGatekeeperService.decideChannels({ userId, context: decisionContext });
    if (!decision?.sms) return { dispatched: false, reason: 'gatekeeper_sms_false', decision };

    const body = buildSmsBody({ title: notification.title, message: notification.message });
    const log = await NotificationSmsLog.create({
      userId,
      agencyId,
      notificationId: notification.id,
      toNumber: to,
      fromNumber: User.normalizePhone(from) || from,
      body,
      status: 'pending'
    });

    try {
      const msg = await TwilioService.sendSms({
        to,
        from: User.normalizePhone(from) || from,
        body
      });
      await NotificationSmsLog.updateStatus(log.id, { status: 'sent', twilioSid: msg.sid, errorMessage: null });
      return { dispatched: true, channel: 'sms', sid: msg.sid, decision };
    } catch (e) {
      await NotificationSmsLog.updateStatus(log.id, { status: 'failed', errorMessage: e.message });
      return { dispatched: false, reason: 'send_failed', error: e.message, decision };
    }
  }
}

export const createNotificationAndDispatch = NotificationDispatcherService.createNotificationAndDispatch.bind(
  NotificationDispatcherService
);

export const isCategoryEnabledForUser = async ({ userId, agencyId, categoryKey }) => {
  const key = String(categoryKey || '').trim();
  if (!userId || !key) return true;
  const categories = await resolveNotificationCategories({ userId, agencyId });
  return categories[key] !== false;
};

export default NotificationDispatcherService;

