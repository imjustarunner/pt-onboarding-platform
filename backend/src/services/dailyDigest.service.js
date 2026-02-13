import pool from '../config/database.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import NotificationGatekeeperService from './notificationGatekeeper.service.js';

const DEFAULT_DIGEST_TIME = '07:00';
const WINDOW_MINUTES = 15;

const parseTimeToMinutes = (raw) => {
  const v = String(raw || '').trim();
  const match = v.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hh = Math.max(0, Math.min(23, parseInt(match[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(match[2], 10)));
  return hh * 60 + mm;
};

const sameDate = (a, b, tz = null) => {
  if (!a || !b) return false;
  if (!tz || typeof tz !== 'string' || !tz.trim()) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  try {
    const fmt = { timeZone: tz.trim(), year: 'numeric', month: '2-digit', day: '2-digit' };
    return a.toLocaleString('en-CA', fmt) === b.toLocaleString('en-CA', fmt);
  } catch {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
};

const formatDateLabel = (d) => {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
};

const formatTypeLabel = (type) =>
  String(type || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const truncate = (val, max = 180) => {
  const s = String(val || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
};

/** Get current hour*60+minute in the given timezone (IANA e.g. America/New_York). */
const getLocalMinutesInTimezone = (tz, date) => {
  if (!tz || typeof tz !== 'string' || !tz.trim()) return null;
  try {
    const str = date.toLocaleString('en-US', { timeZone: tz.trim(), hour: '2-digit', minute: '2-digit', hour12: false });
    const [h, m] = str.split(':').map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  } catch {
    return null;
  }
};

const shouldSendNow = ({ digestTime, lastSentAt, now, timezone }) => {
  const t = parseTimeToMinutes(digestTime || DEFAULT_DIGEST_TIME);
  if (t === null) return false;
  if (lastSentAt && sameDate(lastSentAt, now, timezone)) return false;
  const nowMinutes = timezone
    ? getLocalMinutesInTimezone(timezone, now)
    : (now.getHours() * 60 + now.getMinutes());
  if (nowMinutes === null) return false;
  return nowMinutes >= t && nowMinutes < t + WINDOW_MINUTES;
};

class DailyDigestService {
  static async runDailyDigestTick({ now = new Date() } = {}) {
    const [rows] = await pool.execute(
      `SELECT
         up.user_id,
         up.daily_digest_time,
         up.daily_digest_last_sent_at,
         up.timezone,
         u.email,
         u.work_email,
         (SELECT MIN(ua.agency_id) FROM user_agencies ua WHERE ua.user_id = up.user_id) AS agency_id
       FROM user_preferences up
       JOIN users u ON u.id = up.user_id
       WHERE up.daily_digest_enabled = TRUE
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (u.is_active = TRUE OR u.is_active IS NULL)
         AND (UPPER(COALESCE(u.status, '')) <> 'ARCHIVED')`
    );

    for (const row of rows || []) {
      const userId = Number(row.user_id || 0);
      if (!userId) continue;
      const agencyId = row.agency_id ? Number(row.agency_id) : null;
      if (!agencyId) continue;
      const to = row.email || row.work_email || null;
      if (!to) continue;

      const lastSentAt = row.daily_digest_last_sent_at ? new Date(row.daily_digest_last_sent_at) : null;
      if (!shouldSendNow({ digestTime: row.daily_digest_time, lastSentAt, now, timezone: row.timezone })) continue;

      const since = lastSentAt || new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const [notifications] = await pool.execute(
        `SELECT type, title, message, created_at
         FROM notifications
         WHERE user_id = ?
           AND created_at >= ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId, since]
      );

      const count = (notifications || []).length;
      const byType = new Map();
      for (const n of notifications || []) {
        const key = String(n.type || '').trim() || 'Other';
        byType.set(key, (byType.get(key) || 0) + 1);
      }

      const summaryLines = [];
      if (byType.size > 0) {
        summaryLines.push('By type:');
        for (const [key, val] of byType.entries()) {
          summaryLines.push(`- ${formatTypeLabel(key)}: ${val}`);
        }
      }

      const items = (notifications || []).slice(0, 20).map((n) => {
        const ts = n.created_at ? new Date(n.created_at).toLocaleString() : '';
        const title = truncate(n.title || formatTypeLabel(n.type));
        const msg = truncate(n.message || '');
        return `- ${ts}${ts ? ' — ' : ''}${title}${msg ? `: ${msg}` : ''}`;
      });

      const dateLabel = formatDateLabel(now);
      const subject = `Daily digest — ${dateLabel}`;
      const text = [
        `Daily digest for ${dateLabel}`,
        '',
        `Total updates: ${count}`,
        '',
        ...summaryLines,
        '',
        items.length ? 'Recent updates:' : 'No updates in the last day.',
        ...items
      ].join('\n');

      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2 style="margin: 0 0 8px;">Daily digest — ${dateLabel}</h2>
          <p>Total updates: <strong>${count}</strong></p>
          ${summaryLines.length ? `<p><strong>By type</strong><br/>${summaryLines.slice(1).map((l) => l.replace(/^-\s*/, '')).join('<br/>')}</p>` : ''}
          <p><strong>${items.length ? 'Recent updates' : 'No updates in the last day.'}</strong></p>
          ${items.length ? `<ul>${items.map((l) => `<li>${l.replace(/^-\\s*/, '')}</li>`).join('')}</ul>` : ''}
        </div>
      `.trim();

      try {
        const decision = await NotificationGatekeeperService.decideChannels({
          userId,
          context: { severity: 'info' }
        });
        if (!decision?.email) continue;

        await sendNotificationEmail({
          agencyId,
          triggerKey: 'daily_digest',
          to,
          subject,
          text,
          html,
          source: 'auto',
          userId,
          templateType: 'daily_digest',
          templateId: null
        });

        await pool.execute(
          `UPDATE user_preferences
           SET daily_digest_last_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [userId]
        );
      } catch {
        // best-effort
      }
    }
  }
}

export default DailyDigestService;
