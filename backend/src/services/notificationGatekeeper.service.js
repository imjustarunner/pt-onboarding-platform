import UserPreferences from '../models/UserPreferences.model.js';
import User from '../models/User.model.js';
import UserWorkSchedule from '../models/UserWorkSchedule.model.js';

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
  // DB may store JSON as a string depending on driver/config
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
  // Accepts "HH:MM:SS", "HH:MM", or Date objects; returns minutes-from-midnight.
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
  // If not fully configured, treat as always-inside (no quiet-hours restriction).
  if (!allowedDays || allowedDays.length === 0) return true;
  if (startMinutes === null || endMinutes === null) return true;

  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  if (!allowedDays.includes(dayName)) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Normal window (e.g., 09:00–17:00)
  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // Overnight window (e.g., 22:00–06:00)
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

/**
 * Notification Gatekeeper (single source of truth)
 *
 * Precedence for email/SMS windowing:
 * 1) urgent / emergency_override bypass
 * 2) quiet hours (if enabled)
 * 3) else work schedule (if present and active), unless allow_notifications_outside_work_schedule
 *
 * Use this for future outbound delivery (Email/SMS). Existing in-app notifications
 * can remain as-is; this service determines which channels are eligible.
 */
class NotificationGatekeeperService {
  /**
   * Decide which channels are allowed for a user and message context.
   *
   * @param {Object} params
   * @param {number} params.userId
   * @param {Object} [params.context]
   * @param {string} [params.context.severity] - e.g. 'info'|'warning'|'urgent'
   * @param {boolean} [params.context.isUrgent]
   * @param {boolean} [params.context.isEmergencyBroadcast]
   * @param {boolean} [params.context.isBlockingCompliance]
   * @param {Date} [params.now]
   * @returns {Promise<{inApp: boolean, email: boolean, sms: boolean, reasonCodes: string[]}>}
   */
  static async decideChannels({ userId, context = {}, now = new Date() }) {
    const reasonCodes = [];

    const user = await User.findById(userId);
    const userRole = user?.role || 'staff';

    const stored = await UserPreferences.findByUserId(userId);
    const prefs = stored ? { ...buildDefaultPreferences(userRole), ...stored } : buildDefaultPreferences(userRole);

    // In-app is a safety + audit requirement; cannot be disabled.
    const inApp = true;

    const emailToggle = prefs.email_enabled !== false;
    const smsToggle = prefs.sms_enabled === true;

    const emergencyOverrideEnabled = prefs.emergency_override === true;
    const isEmergencyBroadcast = context.isEmergencyBroadcast === true;
    const isBlockingCompliance = context.isBlockingCompliance === true;
    const isUrgent = context.isUrgent === true || context.severity === 'urgent';

    // Emergency broadcasts and blocking compliance alerts bypass preferences entirely.
    if (isEmergencyBroadcast) {
      reasonCodes.push('bypass_emergency_broadcast');
      return { inApp: true, email: true, sms: true, reasonCodes };
    }
    if (isBlockingCompliance) {
      reasonCodes.push('bypass_blocking_compliance');
      return { inApp: true, email: true, sms: true, reasonCodes };
    }

    // Precedence: urgent/emergency-override bypass → quiet hours if enabled → else work schedule if present.
    let windowBlocksExternal = false;
    const windowBypass = isUrgent || emergencyOverrideEnabled;

    if (windowBypass) {
      reasonCodes.push(isUrgent ? 'window_bypass_urgent' : 'window_bypass_emergency_override');
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
        reasonCodes.push('work_schedule_bypass_allow_outside');
      } else {
        const insideWork = await UserWorkSchedule.isInsideWorkSchedule(userId, now);
        if (insideWork === false) {
          windowBlocksExternal = true;
          reasonCodes.push('work_schedule_outside_window');
        } else if (insideWork === true) {
          reasonCodes.push('within_work_schedule');
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
