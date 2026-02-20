import pool from '../config/database.js';

class ProviderScheduleEvent {
  static async create({
    agencyId,
    providerId,
    kind,
    title,
    description = null,
    reasonCode = null,
    isPrivate = false,
    allDay = false,
    startAt = null,
    endAt = null,
    startDate = null,
    endDate = null,
    googleEventId = null,
    googleHtmlLink = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO provider_schedule_events
        (agency_id, provider_id, kind, title, description, reason_code, is_private, all_day, start_at, end_at, start_date, end_date, status, google_event_id, google_html_link, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
      [
        agencyId == null ? null : Number(agencyId),
        Number(providerId),
        String(kind || '').trim().toUpperCase(),
        String(title || '').trim(),
        description ? String(description) : null,
        reasonCode ? String(reasonCode).trim().toUpperCase() : null,
        isPrivate ? 1 : 0,
        allDay ? 1 : 0,
        startAt || null,
        endAt || null,
        startDate || null,
        endDate || null,
        googleEventId ? String(googleEventId) : null,
        googleHtmlLink ? String(googleHtmlLink) : null,
        createdByUserId ? Number(createdByUserId) : null,
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const eid = Number(id || 0);
    if (!eid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_schedule_events
       WHERE id = ?
       LIMIT 1`,
      [eid]
    );
    return rows?.[0] || null;
  }

  static async listForUserInWindow({ agencyId, providerId, windowStart, windowEnd }) {
    const aId = Number(agencyId || 0);
    const pId = Number(providerId || 0);
    if (!pId || !windowStart || !windowEnd) return [];
    const scopeClause = aId > 0 ? '(pse.agency_id = ? OR pse.agency_id IS NULL)' : 'pse.agency_id IS NULL';
    const params = aId > 0
      ? [aId, pId, windowEnd, windowStart, windowEnd, windowStart]
      : [pId, windowEnd, windowStart, windowEnd, windowStart];
    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_schedule_events pse
       WHERE ${scopeClause}
         AND pse.provider_id = ?
         AND UPPER(COALESCE(pse.status, 'ACTIVE')) <> 'CANCELLED'
         AND (
           (pse.all_day = 1 AND pse.start_date < DATE(?) AND pse.end_date > DATE(?))
           OR
           (pse.all_day = 0 AND pse.start_at < ? AND pse.end_at > ?)
         )
       ORDER BY
         CASE WHEN pse.all_day = 1 THEN CONCAT(pse.start_date, ' 00:00:00') ELSE pse.start_at END ASC,
         pse.id ASC`,
      params
    );
    return rows || [];
  }
}

export default ProviderScheduleEvent;
