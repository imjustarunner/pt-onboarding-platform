import UserPreferences from '../models/UserPreferences.model.js';
import User from '../models/User.model.js';
import { isUserAvailable } from './availabilityWindow.service.js';

const employeeLikeRoles = new Set([
  'staff',
  'provider',
  'school_staff',
  // 'clinician', // legacy (removed)
  'facilitator',
  'intern',
  'supervisor',
  'clinical_practice_assistant'
]);

function buildDefaultPreferences(userRole) {
  return {
    email_enabled: true,
    sms_enabled: employeeLikeRoles.has(userRole),
    in_app_enabled: true,
    quiet_hours_enabled: false,
    quiet_hours_allowed_days: null,
    quiet_hours_start_time: null,
    quiet_hours_end_time: null,
    allow_notifications_outside_work_schedule: false,
    auto_reply_enabled: false,
    auto_reply_message: null,
    emergency_override: false,
    notification_categories: null
  };
}

function normalizeAllowedDays(days) {
  if (!days) return null;
  if (Array.isArray(days)) return days;
  if (typeof days === 'string') {
    try {
      const parsed = JSON.parse(days);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseTimeToMinutes(t) {
  if (!t) return null;
  if (t instanceof Date) {
    return t.getHours() * 60 + t.getMinutes();
  }
  if (typeof t === 'string') {
    const parts = t.split(':').map((p) => parseInt(p, 10));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
  }
  return null;
}

function isInsideWorkingWindow({ now, allowedDays, startMinutes, endMinutes }) {
  if (!allowedDays || allowedDays.length === 0) return true;
  if (startMinutes === null || endMinutes === null) return true;

  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  if (!allowedDays.includes(dayName)) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

/**
 * Notification Gatekeeper (single source of truth)
 *
 * Precedence for email/SMS windowing:
 * 1) urgent / emergency_override / meeting-reminder bypass
 * 2) quiet hours (if enabled)
 * 3) else Availability Hours (default Mon–Fri 6am–7pm, or employee override),
 *    unless allow_notifications_outside_work_schedule
 */
class NotificationGatekeeperService {
  static async decideChannels({ userId, context = {}, now = new Date() }) {
    const reasonCodes = [];

    const user = await User.findById(userId);
    const userRole = user?.role || 'staff';

    const stored = await UserPreferences.findByUserId(userId);
    const prefs = stored ? { ...buildDefaultPreferences(userRole), ...stored } : buildDefaultPreferences(userRole);

    const inApp = true;

    const emailToggle = prefs.email_enabled !== false;
    const smsToggle = prefs.sms_enabled === true;

    const emergencyOverrideEnabled = prefs.emergency_override === true;
    const isEmergencyBroadcast = context.isEmergencyBroadcast === true;
    const isBlockingCompliance = context.isBlockingCompliance === true;
    const isUrgent = context.isUrgent === true || context.severity === 'urgent';
    const isMeetingReminder = context.isMeetingReminder === true;

    if (isEmergencyBroadcast) {
      reasonCodes.push('bypass_emergency_broadcast');
      return { inApp: true, email: true, sms: true, reasonCodes };
    }
    if (isBlockingCompliance) {
      reasonCodes.push('bypass_blocking_compliance');
      return { inApp: true, email: true, sms: true, reasonCodes };
    }

    let windowBlocksExternal = false;
    let meetingReminderBypass = isMeetingReminder;
    if (isMeetingReminder) {
      try {
        const [prefRows] = await (await import('../config/database.js')).default.execute(
          `SELECT meeting_reminder_bypass_availability FROM user_communication_prefs WHERE user_id = ? LIMIT 1`,
          [userId]
        );
        if (prefRows?.[0] && prefRows[0].meeting_reminder_bypass_availability === 0) {
          meetingReminderBypass = false;
        }
      } catch {
        /* default: meeting reminders bypass when pref unset */
      }
    }
    const windowBypass = isUrgent || emergencyOverrideEnabled || meetingReminderBypass;

    if (windowBypass) {
      reasonCodes.push(
        isUrgent
          ? 'window_bypass_urgent'
          : (meetingReminderBypass ? 'window_bypass_meeting_reminder' : 'window_bypass_emergency_override')
      );
    } else if (prefs.quiet_hours_enabled) {
      const allowedDays = normalizeAllowedDays(prefs.quiet_hours_allowed_days);
      const startMinutes = parseTimeToMinutes(prefs.quiet_hours_start_time);
      const endMinutes = parseTimeToMinutes(prefs.quiet_hours_end_time);
      const inside = isInsideWorkingWindow({ now, allowedDays, startMinutes, endMinutes });
      windowBlocksExternal = !inside;
      if (windowBlocksExternal) reasonCodes.push('quiet_hours_outside_window');
    } else {
      const allowOutside = prefs.allow_notifications_outside_work_schedule === true
        || prefs.allow_notifications_outside_work_schedule === 1
        || prefs.allow_notifications_outside_work_schedule === '1';
      if (allowOutside) {
        reasonCodes.push('availability_bypass_allow_outside');
      } else {
        const { available, schedule } = await isUserAvailable(userId, now);
        if (schedule?.source === 'disabled') {
          reasonCodes.push('availability_disabled');
        } else if (!available) {
          windowBlocksExternal = true;
          reasonCodes.push('availability_outside_window');
        } else {
          reasonCodes.push(schedule?.source === 'override' ? 'within_availability_override' : 'within_availability_default');
        }
      }
    }

    const email = emailToggle && !windowBlocksExternal;
    const sms = smsToggle && !windowBlocksExternal;

    if (!emailToggle) reasonCodes.push('email_disabled');
    if (!smsToggle) reasonCodes.push('sms_disabled');
    if (!windowBlocksExternal) reasonCodes.push('within_delivery_window');

    return { inApp, email, sms, reasonCodes };
  }
}

export default NotificationGatekeeperService;
