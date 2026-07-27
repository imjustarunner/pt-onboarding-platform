import pool from '../config/database.js';
import { generateJoinToken } from '../utils/joinToken.js';

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
    sessionIndex = null,
    joinToken = null,
    isTrainingPayEligible = false,
    waitingRoomEnabled = true,
    meetingSubtype = 'general'
  }) {
    const kindUpper = String(kind || '').trim().toUpperCase();
    const needsJoinToken = ['TEAM_MEETING', 'HUDDLE'].includes(kindUpper) && !!platformVideoLink;
    const participantToken = needsJoinToken ? String(joinToken || generateJoinToken()).slice(0, 64) : (joinToken || null);
    const hostToken = needsJoinToken ? generateJoinToken().slice(0, 64) : null;
    const waitingRoomFlag = waitingRoomEnabled === false || waitingRoomEnabled === 0 ? 0 : 1;
    const requestedSubtype = String(meetingSubtype || '').trim().toLowerCase();
    const subtype = kindUpper === 'TEAM_MEETING' && (requestedSubtype === 'admin' || requestedSubtype === 'town_hall')
      ? requestedSubtype
      : 'general';
    try {
      const [result] = await pool.execute(
        `INSERT INTO provider_schedule_events
          (join_token, host_join_token, participant_join_token, waiting_room_enabled,
           agency_id, provider_id, client_id, entitlement_id, package_payment_id, session_index,
           kind, title, description, reason_code, is_private, all_day, start_at, end_at, start_date, end_date, status,
           recurrence_series_id, recurrence_frequency, recurrence_policy, recurrence_index,
           google_event_id, google_html_link, google_meet_link, platform_video_link,
           is_training_pay_eligible, meeting_subtype, created_by_user_id, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          participantToken,
          hostToken,
          participantToken,
          waitingRoomFlag,
          agencyId == null ? null : Number(agencyId),
          Number(providerId),
          clientId ? Number(clientId) : null,
          entitlementId ? Number(entitlementId) : null,
          packagePaymentId ? Number(packagePaymentId) : null,
          sessionIndex == null ? null : Math.max(1, Number(sessionIndex) || 1),
          kindUpper,
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
          isTrainingPayEligible ? 1 : 0,
          subtype,
          createdByUserId ? Number(createdByUserId) : null,
          createdByUserId ? Number(createdByUserId) : null
        ]
      );
      return this.findById(result.insertId);
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
    const [result] = await pool.execute(
      `INSERT INTO provider_schedule_events
        (join_token, agency_id, provider_id, client_id, entitlement_id, package_payment_id, session_index,
         kind, title, description, reason_code, is_private, all_day, start_at, end_at, start_date, end_date, status,
         recurrence_series_id, recurrence_frequency, recurrence_policy, recurrence_index,
         google_event_id, google_html_link, google_meet_link, platform_video_link,
         is_training_pay_eligible, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        participantToken,
        agencyId == null ? null : Number(agencyId),
        Number(providerId),
        clientId ? Number(clientId) : null,
        entitlementId ? Number(entitlementId) : null,
        packagePaymentId ? Number(packagePaymentId) : null,
        sessionIndex == null ? null : Math.max(1, Number(sessionIndex) || 1),
        kindUpper,
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
        isTrainingPayEligible ? 1 : 0,
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

  static async findByJoinToken(joinToken) {
    const token = String(joinToken || '').trim();
    if (!token) return null;
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM provider_schedule_events
         WHERE join_token = ?
            OR host_join_token = ?
            OR participant_join_token = ?
         LIMIT 1`,
        [token, token, token]
      );
      return rows?.[0] || null;
    } catch (e) {
      if (!/host_join_token|participant_join_token/i.test(String(e?.message || ''))) throw e;
      const [rows] = await pool.execute(
        `SELECT * FROM provider_schedule_events WHERE join_token = ? LIMIT 1`,
        [token]
      );
      return rows?.[0] || null;
    }
  }

  static classifyJoinTokenRole(row, ref) {
    const raw = String(ref || '').trim();
    if (!row || !raw || /^\d+$/.test(raw)) return 'legacy';
    if (String(row.host_join_token || '') === raw) return 'host';
    if (String(row.participant_join_token || '') === raw || String(row.join_token || '') === raw) {
      return 'participant';
    }
    return 'legacy';
  }

  static async resolveByJoinRef(ref) {
    const raw = String(ref || '').trim();
    if (!raw) return null;
    let row = null;
    if (/^\d+$/.test(raw)) {
      row = await this.findById(raw);
    } else {
      row = await this.findByJoinToken(raw);
    }
    if (!row) return null;
    const isMeeting = ['TEAM_MEETING', 'HUDDLE'].includes(String(row.kind || '').toUpperCase());
    if (!row.join_token && isMeeting) {
      const token = generateJoinToken();
      try {
        await pool.execute(
          `UPDATE provider_schedule_events SET join_token = ? WHERE id = ? AND join_token IS NULL`,
          [token, Number(row.id)]
        );
        row.join_token = token;
      } catch {
        /* pre-migration */
      }
    }
    if (isMeeting) {
      try {
        const updates = [];
        const vals = [];
        if (!row.participant_join_token && row.join_token) {
          updates.push('participant_join_token = ?');
          vals.push(String(row.join_token).slice(0, 64));
          row.participant_join_token = row.join_token;
        }
        if (!row.host_join_token) {
          const hostTok = generateJoinToken().slice(0, 64);
          updates.push('host_join_token = ?');
          vals.push(hostTok);
          row.host_join_token = hostTok;
        }
        if (row.waiting_room_enabled == null) {
          updates.push('waiting_room_enabled = 1');
          row.waiting_room_enabled = 1;
        }
        if (updates.length) {
          vals.push(Number(row.id));
          await pool.execute(
            `UPDATE provider_schedule_events SET ${updates.join(', ')} WHERE id = ? LIMIT 1`,
            vals
          );
        }
      } catch {
        /* columns may not exist yet */
      }
    }
    return row;
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
    // Fall school-visit bookings store the school org as agency_id (for logo).
    // Always include those for this provider even when the calendar is filtered to the tenant.
    const fallVisitClause = `(pse.provider_id = ? AND UPPER(COALESCE(pse.kind, '')) IN ('FALL_CHECKIN_PRESLOT', 'FALL_CHECKIN_BOOKED'))`;
    const params = [...scopeParams, pId, pId, pId, windowEnd, windowStart, windowEnd, windowStart];
    // Include CANCELLED rows so cancelled meetings remain visible on calendars.
    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_schedule_events pse
       WHERE (
           (${scopeClause} AND ${userClause})
           OR ${fallVisitClause}
         )
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
    isTrainingPayEligible = undefined,
    meetingSubtype = undefined,
    waitingRoomEnabled = undefined,
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
    if (isTrainingPayEligible !== undefined) {
      sets.push('is_training_pay_eligible = ?');
      params.push(isTrainingPayEligible ? 1 : 0);
    }
    if (meetingSubtype !== undefined) {
      const requestedSubtype = String(meetingSubtype || '').trim().toLowerCase();
      const nextSubtype = (requestedSubtype === 'admin' || requestedSubtype === 'town_hall')
        ? requestedSubtype
        : 'general';
      sets.push('meeting_subtype = ?');
      params.push(nextSubtype);
    }
    if (waitingRoomEnabled !== undefined) {
      sets.push('waiting_room_enabled = ?');
      params.push(waitingRoomEnabled === false || waitingRoomEnabled === 0 ? 0 : 1);
    }
    if (!sets.length) return this.findByIdForProvider({ eventId: eid, providerId: pid });
    sets.push('updated_by_user_id = ?');
    params.push(updatedByUserId ? Number(updatedByUserId) : null);
    params.push(eid, pid);
    try {
      await pool.execute(
        `UPDATE provider_schedule_events
         SET ${sets.join(', ')}
         WHERE id = ? AND provider_id = ?
           AND UPPER(COALESCE(status, 'ACTIVE')) <> 'CANCELLED'`,
        params
      );
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR' && meetingSubtype !== undefined) {
        // Retry without meeting_subtype when migration 1052 is not applied yet.
        return this.updateForProvider({
          eventId: eid,
          providerId: pid,
          title,
          description,
          isPrivate,
          allDay,
          startAt,
          endAt,
          startDate,
          endDate,
          agencyId,
          clientId,
          reasonCode,
          isTrainingPayEligible,
          waitingRoomEnabled,
          updatedByUserId
        });
      }
      throw e;
    }
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

  static async listActiveOthersInSeries({
    recurrenceSeriesId,
    providerId,
    excludeEventId
  }) {
    const sid = String(recurrenceSeriesId || '').trim();
    const pid = Number(providerId || 0);
    const excludeId = Number(excludeEventId || 0);
    if (!sid || !pid || !excludeId) return [];
    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_schedule_events
       WHERE recurrence_series_id = ?
         AND provider_id = ?
         AND id <> ?
         AND UPPER(COALESCE(status, 'ACTIVE')) <> 'CANCELLED'
       ORDER BY
         CASE WHEN all_day = 1 THEN CONCAT(start_date, ' 00:00:00') ELSE start_at END ASC,
         id ASC`,
      [sid, pid, excludeId]
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
