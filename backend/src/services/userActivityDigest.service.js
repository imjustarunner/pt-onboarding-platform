import pool from '../config/database.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';

const ELIGIBLE_ROLES = new Set(['super_admin', 'admin', 'support', 'clinical_practice_assistant', 'provider_plus']);

function localParts(now, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
  } catch {
    return { date: now.toISOString().slice(0, 10), minutes: now.getUTCHours() * 60 + now.getUTCMinutes() };
  }
}

function parseDigestMinutes(value) {
  const match = String(value || '07:00').match(/^(\d{2}):(\d{2})$/);
  if (!match) return 7 * 60;
  return Math.min(1439, Math.max(0, Number(match[1]) * 60 + Number(match[2])));
}

class UserActivityDigestService {
  static async runTick({ now = new Date() } = {}) {
    const [users] = await pool.execute(
      `SELECT u.id, u.role, up.timezone, up.daily_digest_time
       FROM users u
       LEFT JOIN user_preferences up ON up.user_id = u.id
       WHERE (u.is_active = TRUE OR u.is_active IS NULL)
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)`
    );
    let created = 0;
    for (const viewer of users || []) {
      const role = String(viewer.role || '').toLowerCase();
      if (!ELIGIBLE_ROLES.has(role)) continue;
      const local = localParts(now, viewer.timezone || 'UTC');
      const target = parseDigestMinutes(viewer.daily_digest_time || '07:00');
      if (local.minutes < target || local.minutes >= target + 15) continue;
      const [existing] = await pool.execute(
        `SELECT id FROM notification_activity_digests WHERE user_id = ? AND digest_date = ? LIMIT 1`,
        [Number(viewer.id), local.date]
      );
      if (existing?.[0]) continue;

      let agencyIds = [];
      if (role === 'super_admin') {
        const [agencyRows] = await pool.execute('SELECT id FROM agencies WHERE is_active = TRUE');
        agencyIds = (agencyRows || []).map((row) => Number(row.id)).filter(Boolean);
      } else {
        agencyIds = (await User.getAgencies(viewer.id) || []).map((agency) => Number(agency.id)).filter(Boolean);
      }
      if (!agencyIds.length) continue;
      const periodEnd = now;
      const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const placeholders = agencyIds.map(() => '?').join(',');
      const audienceKey = role === 'clinical_practice_assistant' ? 'clinicalPracticeAssistant' : 'admin';
      const [events] = await pool.execute(
        `SELECT n.id, n.type, n.agency_id
         FROM notifications n
         WHERE n.agency_id IN (${placeholders})
           AND n.type IN ('user_login', 'user_logout')
           AND n.created_at >= ? AND n.created_at < ?
           AND (
             n.audience_json IS NULL
             OR JSON_EXTRACT(n.audience_json, '$.${audienceKey}') IS NULL
             OR JSON_EXTRACT(n.audience_json, '$.${audienceKey}') = TRUE
           )`,
        [...agencyIds, periodStart, periodEnd]
      );
      if (!events?.length) continue;
      const byType = { user_login: 0, user_logout: 0 };
      const byAgency = {};
      for (const event of events) {
        byType[event.type] = (byType[event.type] || 0) + 1;
        byAgency[event.agency_id] = (byAgency[event.agency_id] || 0) + 1;
      }
      const [insert] = await pool.execute(
        `INSERT IGNORE INTO notification_activity_digests
          (user_id, digest_date, period_start, period_end, event_count, breakdown_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [Number(viewer.id), local.date, periodStart, periodEnd, events.length, JSON.stringify({ byType, byAgency })]
      );
      if (!insert.affectedRows) continue;
      const digestId = insert.insertId;
      const notification = await Notification.create({
        type: 'user_activity_digest',
        severity: 'info',
        title: 'Daily user activity',
        message: `${events.length} account activity event${events.length === 1 ? '' : 's'}: ${byType.user_login || 0} login${byType.user_login === 1 ? '' : 's'} and ${byType.user_logout || 0} logout${byType.user_logout === 1 ? '' : 's'}.`,
        userId: Number(viewer.id),
        agencyId: agencyIds[0],
        relatedEntityType: 'notification_activity_digest',
        relatedEntityId: digestId,
        actorSource: 'System'
      });
      await pool.execute(
        `UPDATE notification_activity_digests SET notification_id = ? WHERE id = ?`,
        [notification.id, digestId]
      );
      created += 1;
    }
    return { created };
  }
}

export default UserActivityDigestService;
