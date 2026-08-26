import pool from '../config/database.js';

const EVENT_TYPES = new Set(['impression', 'open', 'dismiss', 'acknowledge']);

export function parsePublishStatus(raw) {
  const v = String(raw || 'published').trim().toLowerCase();
  return v === 'draft' ? 'draft' : 'published';
}

export function parsePriority(raw) {
  const v = String(raw || 'medium').trim().toLowerCase();
  if (v === 'high' || v === 'low') return v;
  return 'medium';
}

export function deriveLifecycleStatus({ publishStatus, startsAt, endsAt, now = new Date() }) {
  if (String(publishStatus || 'published') === 'draft') return 'draft';
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
  const t = now.getTime();
  if (Number.isFinite(start.getTime()) && t < start.getTime()) return 'scheduled';
  if (Number.isFinite(end.getTime()) && t > end.getTime()) return 'expired';
  return 'active';
}

/** Viewed rate = opens / impressions (unique users who opened ÷ unique users presented). */
export function computeViewedRate(impressions, opens) {
  const denom = Number(impressions || 0);
  const num = Number(opens || 0);
  if (denom <= 0) return 0;
  return Math.min(100, Math.round((num / denom) * 100));
}

export async function recordAnnouncementEvent({
  agencyId,
  announcementId,
  userId,
  eventType
}) {
  const aid = Number(agencyId);
  const annId = Number(announcementId);
  const uid = Number(userId);
  const type = String(eventType || '').trim().toLowerCase();
  if (!aid || !annId || !uid || !EVENT_TYPES.has(type)) return { recorded: false };
  const [owned] = await pool.execute(
    `SELECT id FROM agency_scheduled_announcements WHERE id = ? AND agency_id = ? LIMIT 1`,
    [annId, aid]
  );
  if (!owned?.length) return { recorded: false, reason: 'not_found' };
  await pool.execute(
    `INSERT IGNORE INTO agency_scheduled_announcement_events
      (agency_id, announcement_id, user_id, event_type)
     VALUES (?, ?, ?, ?)`,
    [aid, annId, uid, type]
  );
  return { recorded: true };
}

export async function getAnnouncementEngagementOverview(agencyId, { days = 30 } = {}) {
  const aid = Number(agencyId);
  const windowDays = Math.min(90, Math.max(7, Number(days) || 30));
  if (!aid) {
    return {
      impressions: 0,
      opens: 0,
      dismissals: 0,
      acknowledgements: 0,
      viewedRate: 0,
      series: []
    };
  }
  const [totals] = await pool.execute(
    `SELECT
       SUM(event_type = 'impression') AS impressions,
       SUM(event_type = 'open') AS opens,
       SUM(event_type = 'dismiss') AS dismissals,
       SUM(event_type = 'acknowledge') AS acknowledgements
     FROM agency_scheduled_announcement_events
     WHERE agency_id = ?
       AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
    [aid, windowDays]
  );
  const row = totals?.[0] || {};
  const impressions = Number(row.impressions || 0);
  const opens = Number(row.opens || 0);
  const dismissals = Number(row.dismissals || 0);
  const acknowledgements = Number(row.acknowledgements || 0);
  const viewedRate = computeViewedRate(impressions, opens);

  const [prev] = await pool.execute(
    `SELECT
       SUM(event_type = 'impression') AS impressions,
       SUM(event_type = 'open') AS opens,
       SUM(event_type = 'acknowledge') AS acknowledgements,
       SUM(event_type = 'dismiss') AS dismissals
     FROM agency_scheduled_announcement_events
     WHERE agency_id = ?
       AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
       AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
    [aid, windowDays * 2, windowDays]
  );
  const prevRow = prev?.[0] || {};

  const [seriesRows] = await pool.execute(
    `SELECT
       DATE(created_at) AS day,
       SUM(event_type = 'impression') AS impressions,
       SUM(event_type = 'open') AS opens,
       SUM(event_type = 'acknowledge') AS acknowledgements
     FROM agency_scheduled_announcement_events
     WHERE agency_id = ?
       AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)
     ORDER BY day ASC`,
    [aid, windowDays]
  );

  const pctChange = (cur, old) => {
    const a = Number(cur || 0);
    const b = Number(old || 0);
    if (!b && !a) return 0;
    if (!b) return 100;
    return Math.round(((a - b) / b) * 100);
  };

  return {
    windowDays,
    impressions,
    opens,
    dismissals,
    acknowledgements,
    viewedRate,
    trends: {
      impressions: pctChange(impressions, prevRow.impressions),
      opens: pctChange(opens, prevRow.opens),
      dismissals: pctChange(dismissals, prevRow.dismissals),
      acknowledgements: pctChange(acknowledgements, prevRow.acknowledgements)
    },
    series: (seriesRows || []).map((r) => ({
      day: r.day ? String(r.day).slice(0, 10) : null,
      impressions: Number(r.impressions || 0),
      opens: Number(r.opens || 0),
      acknowledgements: Number(r.acknowledgements || 0)
    }))
  };
}

export async function getAnnouncementHubCounts(agencyId) {
  const aid = Number(agencyId);
  if (!aid) {
    return { activeSplashes: 0, scheduled: 0, drafts: 0, viewedRate: 0 };
  }
  const [rows] = await pool.execute(
    `SELECT
       SUM(publish_status = 'published' AND display_type = 'splash' AND NOW() >= starts_at AND NOW() <= ends_at) AS active_splashes,
       SUM(publish_status = 'published' AND NOW() < starts_at) AS scheduled,
       SUM(publish_status = 'draft') AS drafts
     FROM agency_scheduled_announcements
     WHERE agency_id = ?`,
    [aid]
  );
  const overview = await getAnnouncementEngagementOverview(aid, { days: 30 });
  const r = rows?.[0] || {};
  return {
    activeSplashes: Number(r.active_splashes || 0),
    scheduled: Number(r.scheduled || 0),
    drafts: Number(r.drafts || 0),
    viewedRate: overview.viewedRate
  };
}

export async function listScheduledAnnouncementsWithEngagement(agencyId) {
  const aid = Number(agencyId);
  const [rows] = await pool.execute(
    `SELECT
        asa.id,
        asa.title,
        asa.message,
        asa.splash_image_url,
        asa.display_type,
        asa.recipient_user_ids,
        asa.audience,
        asa.starts_at,
        asa.ends_at,
        asa.created_at,
        asa.created_by_user_id,
        asa.publish_status,
        asa.priority,
        CONCAT(TRIM(u.first_name), ' ', TRIM(u.last_name)) AS created_by_name,
        (SELECT COUNT(*) FROM agency_scheduled_announcement_events e
          WHERE e.announcement_id = asa.id AND e.event_type = 'impression') AS impressions,
        (SELECT COUNT(*) FROM agency_scheduled_announcement_events e
          WHERE e.announcement_id = asa.id AND e.event_type = 'open') AS opens,
        (SELECT COUNT(*) FROM agency_scheduled_announcement_events e
          WHERE e.announcement_id = asa.id AND e.event_type = 'dismiss') AS dismissals,
        (SELECT COUNT(*) FROM agency_scheduled_announcement_events e
          WHERE e.announcement_id = asa.id AND e.event_type = 'acknowledge') AS acknowledgements
       FROM agency_scheduled_announcements asa
       LEFT JOIN users u ON u.id = asa.created_by_user_id
       WHERE asa.agency_id = ?
       ORDER BY asa.starts_at DESC, asa.id DESC
       LIMIT 200`,
    [aid]
  );
  return rows || [];
}

/**
 * Users who opened/viewed a specific announcement (event_type = open).
 * Includes optional dismiss/acknowledge timestamps from the same events table.
 */
export async function listAnnouncementViewers(agencyId, announcementId) {
  const aid = Number(agencyId);
  const annId = Number(announcementId);
  if (!aid || !annId) return [];
  const [rows] = await pool.execute(
    `SELECT
       u.id AS user_id,
       TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS full_name,
       u.email,
       o.created_at AS viewed_at,
       (SELECT e.created_at FROM agency_scheduled_announcement_events e
         WHERE e.announcement_id = o.announcement_id AND e.user_id = o.user_id AND e.event_type = 'dismiss'
         LIMIT 1) AS dismissed_at,
       (SELECT e.created_at FROM agency_scheduled_announcement_events e
         WHERE e.announcement_id = o.announcement_id AND e.user_id = o.user_id AND e.event_type = 'acknowledge'
         LIMIT 1) AS acknowledged_at
     FROM agency_scheduled_announcement_events o
     INNER JOIN users u ON u.id = o.user_id
     WHERE o.agency_id = ?
       AND o.announcement_id = ?
       AND o.event_type = 'open'
     ORDER BY o.created_at DESC, u.last_name ASC, u.first_name ASC
     LIMIT 500`,
    [aid, annId]
  );
  return (rows || []).map((r) => ({
    userId: Number(r.user_id),
    fullName: String(r.full_name || '').trim() || r.email || `User ${r.user_id}`,
    email: r.email || null,
    viewedAt: r.viewed_at,
    dismissedAt: r.dismissed_at || null,
    acknowledgedAt: r.acknowledged_at || null
  }));
}
