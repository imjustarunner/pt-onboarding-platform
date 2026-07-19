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
    recurrenceSeriesId = null,
    recurrenceFrequency = null,
    recurrencePolicy = null,
    recurrenceIndex = null,
    googleEventId = null,
    googleHtmlLink = null,
    googleMeetLink = null,
    platformVideoLink = null,
    createdByUserId = null,
    clientId = null,
    entitlementId = null,
    packagePaymentId = null,
    sessionIndex = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO provider_schedule_events
        (agency_id, provider_id, client_id, entitlement_id, package_payment_id, session_index,
         kind, title, description, reason_code, is_private, all_day, start_at, end_at, start_date, end_date, status,
         recurrence_series_id, recurrence_frequency, recurrence_policy, recurrence_index,
         google_event_id, google_html_link, google_meet_link, platform_video_link, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId == null ? null : Number(agencyId),
        Number(providerId),
        clientId ? Number(clientId) : null,
        entitlementId ? Number(entitlementId) : null,
        packagePaymentId ? Number(packagePaymentId) : null,
        sessionIndex == null ? null : Math.max(1, Number(sessionIndex) || 1),
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
        recurrenceSeriesId ? String(recurrenceSeriesId).trim().slice(0, 64) : null,
        recurrenceFrequency ? String(recurrenceFrequency).trim().toUpperCase().slice(0, 16) : null,
        recurrencePolicy ? String(recurrencePolicy).trim().toUpperCase().slice(0, 16) : null,
        recurrenceIndex == null ? null : Math.max(0, parseInt(recurrenceIndex, 10) || 0),
        googleEventId ? String(googleEventId) : null,
        googleHtmlLink ? String(googleHtmlLink) : null,
        googleMeetLink ? String(googleMeetLink).trim().slice(0, 1024) : null,
        platformVideoLink == null ? null : (platformVideoLink ? 1 : 0),
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

  static async listForUserInWindow({ agencyId, agencyIds = null, allAgencies = false, providerId, windowStart, windowEnd }) {
    const pId = Number(providerId || 0);
    if (!pId || !windowStart || !windowEnd) return [];
    const ids = Array.isArray(agencyIds)
      ? Array.from(new Set(agencyIds.map((n) => Number(n || 0)).filter((n) => n > 0)))
      : [];
    const aId = Number(agencyId || 0);
    let scopeClause = 'pse.agency_id IS NULL';
    let scopeParams = [];
    if (allAgencies) {
      scopeClause = '1=1';
    } else if (ids.length) {
      scopeClause = `(pse.agency_id IN (${ids.map(() => '?').join(',')}) OR pse.agency_id IS NULL)`;
      scopeParams = ids;
    } else if (aId > 0) {
      scopeClause = '(pse.agency_id = ? OR pse.agency_id IS NULL)';
      scopeParams = [aId];
    }
    // Include events where user is provider (host) OR where user is attendee of a TEAM_MEETING
    const userClause = `(pse.provider_id = ? OR (
      UPPER(COALESCE(pse.kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
      AND EXISTS (
        SELECT 1 FROM provider_schedule_event_attendees psea
        WHERE psea.event_id = pse.id AND psea.user_id = ?
      )
    ))`;
    const params = [...scopeParams, pId, pId, windowEnd, windowStart, windowEnd, windowStart];
    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_schedule_events pse
       WHERE ${scopeClause}
         AND ${userClause}
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

  static async setVideoRoom(eventId, { roomSid, uniqueName }) {
    const eid = parseInt(eventId, 10);
    if (!eid) return null;
    await pool.execute(
      `UPDATE provider_schedule_events
       SET twilio_room_sid = ?, twilio_room_unique_name = ?
       WHERE id = ?`,
      [roomSid || null, uniqueName || null, eid]
    );
    return this.findById(eid);
  }

  static async findByIdForProvider({ eventId, providerId }) {
    const eid = Number(eventId || 0);
    const pid = Number(providerId || 0);
    if (!eid || !pid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_schedule_events
       WHERE id = ? AND provider_id = ?
       LIMIT 1`,
      [eid, pid]
    );
    return rows?.[0] || null;
  }

  static async updateForProvider({
    eventId,
    providerId,
    title = undefined,
    description = undefined,
    isPrivate = undefined,
    allDay = undefined,
    startAt = undefined,
    endAt = undefined,
    startDate = undefined,
    endDate = undefined,
    agencyId = undefined,
    clientId = undefined,
    reasonCode = undefined,
    updatedByUserId = null
  }) {
    const eid = Number(eventId || 0);
    const pid = Number(providerId || 0);
    if (!eid || !pid) return null;
    const sets = [];
    const params = [];
    if (title !== undefined) {
      sets.push('title = ?');
      params.push(String(title || '').trim().slice(0, 200));
    }
    if (description !== undefined) {
      sets.push('description = ?');
      params.push(description == null || description === '' ? null : String(description).slice(0, 4000));
    }
    if (isPrivate !== undefined) {
      sets.push('is_private = ?');
      params.push(isPrivate ? 1 : 0);
    }
    if (allDay !== undefined) {
      sets.push('all_day = ?');
      params.push(allDay ? 1 : 0);
    }
    if (startAt !== undefined) {
      sets.push('start_at = ?');
      params.push(startAt || null);
    }
    if (endAt !== undefined) {
      sets.push('end_at = ?');
      params.push(endAt || null);
    }
    if (startDate !== undefined) {
      sets.push('start_date = ?');
      params.push(startDate || null);
    }
    if (endDate !== undefined) {
      sets.push('end_date = ?');
      params.push(endDate || null);
    }
    if (agencyId !== undefined) {
      sets.push('agency_id = ?');
      params.push(agencyId == null || Number(agencyId) <= 0 ? null : Number(agencyId));
    }
    if (clientId !== undefined) {
      sets.push('client_id = ?');
      params.push(clientId == null || Number(clientId) <= 0 ? null : Number(clientId));
    }
    if (reasonCode !== undefined) {
      sets.push('reason_code = ?');
      params.push(reasonCode ? String(reasonCode).trim().toUpperCase() : null);
    }
    if (!sets.length) return this.findByIdForProvider({ eventId: eid, providerId: pid });
    sets.push('updated_by_user_id = ?');
    params.push(updatedByUserId ? Number(updatedByUserId) : null);
    params.push(eid, pid);
    await pool.execute(
      `UPDATE provider_schedule_events
       SET ${sets.join(', ')}
       WHERE id = ? AND provider_id = ?
         AND UPPER(COALESCE(status, 'ACTIVE')) <> 'CANCELLED'`,
      params
    );
    return this.findByIdForProvider({ eventId: eid, providerId: pid });
  }

  static async listActiveSeriesFromPoint({
    recurrenceSeriesId,
    providerId,
    fromStartAt = null,
    fromStartDate = null
  }) {
    const sid = String(recurrenceSeriesId || '').trim();
    const pid = Number(providerId || 0);
    if (!sid || !pid) return [];
    const hasStartAt = !!String(fromStartAt || '').trim();
    const hasStartDate = !!String(fromStartDate || '').trim();
    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_schedule_events
       WHERE recurrence_series_id = ?
         AND provider_id = ?
         AND UPPER(COALESCE(status, 'ACTIVE')) <> 'CANCELLED'
         AND (
           (? = 1 AND start_at IS NOT NULL AND start_at >= ?)
           OR
           (? = 1 AND all_day = 1 AND start_date IS NOT NULL AND start_date >= ?)
         )
       ORDER BY
         CASE WHEN all_day = 1 THEN CONCAT(start_date, ' 00:00:00') ELSE start_at END ASC,
         id ASC`,
      [sid, pid, hasStartAt ? 1 : 0, fromStartAt || null, hasStartDate ? 1 : 0, fromStartDate || null]
    );
    return rows || [];
  }

  static async cancelByIds({ eventIds = [], updatedByUserId = null }) {
    const ids = Array.from(new Set((eventIds || []).map((n) => Number(n || 0)).filter((n) => n > 0)));
    if (!ids.length) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.execute(
      `UPDATE provider_schedule_events
       SET status = 'CANCELLED', updated_by_user_id = ?
       WHERE id IN (${placeholders})`,
      [updatedByUserId ? Number(updatedByUserId) : null, ...ids]
    );
    return Number(result?.affectedRows || 0);
  }
}

export default ProviderScheduleEvent;
