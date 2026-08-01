import pool from '../config/database.js';
import Notification from './Notification.model.js';
import { generateJoinToken } from '../utils/joinToken.js';
import { resolveArtifactPlainFields } from '../services/supervisionArtifactEncryption.service.js';

function normalizeInviteScopeValue(raw) {
  const scope = String(raw || 'invited_only').trim().toLowerCase();
  if (scope === 'open_to_all' || scope === 'open_and_invited') return scope;
  return 'invited_only';
}

class SupervisionSession {
  static async create({
    agencyId,
    supervisorUserId,
    coFacilitatorUserId = null,
    superviseeUserId,
    sessionType = 'individual',
    inviteScope = 'invited_only',
    inviteAudienceAllSupervised = false,
    inviteAudienceGroupSupport = false,
    startAt,
    endAt,
    modality = null,
    locationText = null,
    notes = null,
    createdByUserId = null,
    joinToken = null,
    waitingRoomEnabled = true,
    recurrenceSeriesId = null,
    recurrenceFrequency = null,
    recurrenceIndex = null,
    enrollmentMode = 'invited',
    signupClosesAt = null,
    autoCancelIfEmpty = false,
    notifyParticipants = true
  }) {
    const participantToken = String(joinToken || generateJoinToken()).slice(0, 64);
    const hostToken = generateJoinToken().slice(0, 64);
    const audienceAllSupervised = inviteAudienceAllSupervised ? 1 : 0;
    const audienceGroupSupport = inviteAudienceGroupSupport ? 1 : 0;
    const coFacilitatorId = Number(coFacilitatorUserId || 0) > 0 ? Number(coFacilitatorUserId) : null;
    const waitingRoomFlag = waitingRoomEnabled === false || waitingRoomEnabled === 0 ? 0 : 1;
    const enrollment = String(enrollmentMode || 'invited').trim().toLowerCase() === 'signup_only'
      ? 'signup_only'
      : (String(enrollmentMode || 'invited').trim().toLowerCase() === 'open_join' ? 'open_join' : 'invited');
    const autoCancelFlag = autoCancelIfEmpty ? 1 : 0;
    const notifyFlag = notifyParticipants === false || notifyParticipants === 0 || notifyParticipants === '0' || notifyParticipants === 'false'
      ? 0
      : 1;
    try {
      const [result] = await pool.execute(
        `INSERT INTO supervision_sessions
          (join_token, host_join_token, participant_join_token, waiting_room_enabled, notify_participants,
           agency_id, supervisor_user_id, co_facilitator_user_id, supervisee_user_id, session_type, invite_scope,
           invite_audience_all_supervised, invite_audience_group_support,
           enrollment_mode, signup_closes_at, auto_cancel_if_empty,
           start_at, end_at, modality, location_text, notes, status,
           recurrence_series_id, recurrence_frequency, recurrence_index, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?, ?)`,
        [
          participantToken,
          hostToken,
          participantToken,
          waitingRoomFlag,
          notifyFlag,
          Number(agencyId),
          Number(supervisorUserId),
          coFacilitatorId,
          Number(superviseeUserId),
          String(sessionType || 'individual'),
          normalizeInviteScopeValue(inviteScope),
          audienceAllSupervised,
          audienceGroupSupport,
          enrollment,
          signupClosesAt || null,
          autoCancelFlag,
          startAt,
          endAt,
          modality,
          locationText,
          notes,
          recurrenceSeriesId ? String(recurrenceSeriesId).trim().slice(0, 64) : null,
          recurrenceFrequency ? String(recurrenceFrequency).trim().toUpperCase().slice(0, 16) : null,
          recurrenceIndex == null ? null : Math.max(0, parseInt(recurrenceIndex, 10) || 0),
          createdByUserId ? Number(createdByUserId) : null
        ]
      );
      return this.findById(result.insertId);
    } catch (e) {
      const missingEnrollmentCols = /enrollment_mode|signup_closes_at|auto_cancel_if_empty|notify_participants/i.test(String(e?.message || ''));
      if (!missingEnrollmentCols && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
    try {
      const [result] = await pool.execute(
        `INSERT INTO supervision_sessions
          (join_token, host_join_token, participant_join_token, waiting_room_enabled,
           agency_id, supervisor_user_id, co_facilitator_user_id, supervisee_user_id, session_type, invite_scope,
           invite_audience_all_supervised, invite_audience_group_support,
           start_at, end_at, modality, location_text, notes, status,
           recurrence_series_id, recurrence_frequency, recurrence_index, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?, ?)`,
        [
          participantToken,
          hostToken,
          participantToken,
          waitingRoomFlag,
          Number(agencyId),
          Number(supervisorUserId),
          coFacilitatorId,
          Number(superviseeUserId),
          String(sessionType || 'individual'),
          normalizeInviteScopeValue(inviteScope),
          audienceAllSupervised,
          audienceGroupSupport,
          startAt,
          endAt,
          modality,
          locationText,
          notes,
          recurrenceSeriesId ? String(recurrenceSeriesId).trim().slice(0, 64) : null,
          recurrenceFrequency ? String(recurrenceFrequency).trim().toUpperCase().slice(0, 16) : null,
          recurrenceIndex == null ? null : Math.max(0, parseInt(recurrenceIndex, 10) || 0),
          createdByUserId ? Number(createdByUserId) : null
        ]
      );
      return this.findById(result.insertId);
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [result] = await pool.execute(
        `INSERT INTO supervision_sessions
          (join_token, agency_id, supervisor_user_id, supervisee_user_id, session_type, invite_scope, start_at, end_at, modality, location_text, notes, status, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?)`,
        [
          participantToken,
          Number(agencyId),
          Number(supervisorUserId),
          Number(superviseeUserId),
          String(sessionType || 'individual'),
          normalizeInviteScopeValue(inviteScope),
          startAt,
          endAt,
          modality,
          locationText,
          notes,
          createdByUserId ? Number(createdByUserId) : null
        ]
      );
      return this.findById(result.insertId);
    }
  }

  static async listActiveSeriesFromPoint({
    recurrenceSeriesId,
    fromStartAt = null
  }) {
    const sid = String(recurrenceSeriesId || '').trim();
    if (!sid) return [];
    const from = String(fromStartAt || '').trim() || null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM supervision_sessions
       WHERE recurrence_series_id = ?
         AND UPPER(COALESCE(status, 'SCHEDULED')) <> 'CANCELLED'
         AND (? IS NULL OR start_at >= ?)
       ORDER BY start_at ASC, id ASC`,
      [sid, from, from]
    );
    return rows || [];
  }

  static async findByJoinToken(joinToken) {
    const token = String(joinToken || '').trim();
    if (!token) return null;
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM supervision_sessions
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
        `SELECT * FROM supervision_sessions WHERE join_token = ? LIMIT 1`,
        [token]
      );
      return rows?.[0] || null;
    }
  }

  /** Which role link matched: host | participant | legacy */
  static classifyJoinTokenRole(row, ref) {
    const raw = String(ref || '').trim();
    if (!row || !raw || /^\d+$/.test(raw)) return 'legacy';
    if (String(row.host_join_token || '') === raw) return 'host';
    if (String(row.participant_join_token || '') === raw || String(row.join_token || '') === raw) {
      return 'participant';
    }
    return 'legacy';
  }

  /** Resolve numeric id or opaque join_token. Lazily backfills token when missing. */
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
    if (!row.join_token) {
      const token = generateJoinToken();
      try {
        await pool.execute(`UPDATE supervision_sessions SET join_token = ? WHERE id = ? AND join_token IS NULL`, [
          token,
          Number(row.id)
        ]);
        row.join_token = token;
      } catch {
        /* column may not exist yet pre-migration */
      }
    }
    // Best-effort backfill host/participant tokens after migration 1048.
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
          `UPDATE supervision_sessions SET ${updates.join(', ')} WHERE id = ? LIMIT 1`,
          vals
        );
      }
    } catch {
      /* columns may not exist yet */
    }
    return row;
  }

  static async upsertAttendees(sessionId, attendees = []) {
    const sid = parseInt(sessionId, 10);
    if (!sid || !Array.isArray(attendees) || !attendees.length) return;

    const normalized = [];
    const seen = new Set();
    for (const row of attendees) {
      const userId = parseInt(row?.userId, 10);
      if (!userId) continue;
      if (seen.has(userId)) continue;
      seen.add(userId);
      normalized.push({
        userId,
        participantRole: String(row?.participantRole || 'supervisee'),
        isRequired: (row?.isRequired === true || row?.isRequired === 1) ? 1 : 0,
        isCompensableSnapshot: row?.isCompensableSnapshot ? 1 : 0,
        status: String(row?.status || 'INVITED')
      });
    }
    if (!normalized.length) return;

    const placeholders = normalized.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const values = normalized.flatMap((r) => [sid, r.userId, r.participantRole, r.isRequired, r.isCompensableSnapshot, r.status]);
    await pool.execute(
      `INSERT INTO supervision_session_attendees
        (session_id, user_id, participant_role, is_required, is_compensable_snapshot, status)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         participant_role = VALUES(participant_role),
         is_required = VALUES(is_required),
         is_compensable_snapshot = VALUES(is_compensable_snapshot),
         status = VALUES(status),
         updated_at = CURRENT_TIMESTAMP`,
      values
    );
  }

  static async listAttendees(sessionId) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return [];
    const [rows] = await pool.execute(
      `SELECT ssa.*,
              u.first_name,
              u.last_name,
              u.email
       FROM supervision_session_attendees ssa
       LEFT JOIN users u ON u.id = ssa.user_id
       WHERE ssa.session_id = ?
       ORDER BY CASE WHEN ssa.participant_role = 'supervisor' THEN 0 ELSE 1 END, ssa.id ASC`,
      [sid]
    );
    return rows || [];
  }

  static async findAttendeeBySessionUser(sessionId, userId) {
    const sid = parseInt(sessionId, 10);
    const uid = parseInt(userId, 10);
    if (!sid || !uid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM supervision_session_attendees
       WHERE session_id = ? AND user_id = ?
       LIMIT 1`,
      [sid, uid]
    );
    return rows?.[0] || null;
  }

  static async setAttendeeStatus({ sessionId, userId, status }) {
    const sid = parseInt(sessionId, 10);
    const uid = parseInt(userId, 10);
    const st = String(status || '').trim().toUpperCase();
    if (!sid || !uid || !st) return false;
    const [result] = await pool.execute(
      `UPDATE supervision_session_attendees
       SET status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND user_id = ?`,
      [st, sid, uid]
    );
    return (result?.affectedRows || 0) > 0;
  }

  static async listPromptSessionsForUser({ userId, agencyId = null, now = new Date() }) {
    const uid = parseInt(userId, 10);
    const nowDate = now instanceof Date ? now : new Date(now);
    if (!uid || Number.isNaN(nowDate.getTime())) return [];
    const nowSql = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')} ${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}:${String(nowDate.getSeconds()).padStart(2, '0')}`;

    const whereAgency = Number(agencyId) > 0 ? 'AND ss.agency_id = ?' : '';
    const args = [uid, uid];
    if (Number(agencyId) > 0) args.push(Number(agencyId));
    args.push(nowSql, nowSql);

    const [rows] = await pool.execute(
      `SELECT
         ss.id,
         ss.agency_id,
         ss.session_type,
         ss.start_at,
         ss.end_at,
         ss.status,
         ss.google_meet_link,
         ss.modality,
         ss.notes,
         ss.supervisor_user_id,
         CONCAT(COALESCE(sup.first_name, ''), ' ', COALESCE(sup.last_name, '')) AS supervisor_name,
         ssa.id AS attendee_id,
         ssa.user_id AS attendee_user_id,
         ssa.participant_role,
         ssa.is_required
       FROM supervision_sessions ss
       JOIN users sup ON sup.id = ss.supervisor_user_id
       LEFT JOIN supervision_session_attendees ssa
         ON ssa.session_id = ss.id
        AND ssa.user_id = ?
       WHERE (
           ss.supervisee_user_id = ?
           OR ssa.user_id IS NOT NULL
         )
         ${whereAgency}
         AND (ss.status IS NULL OR ss.status <> 'CANCELLED')
         AND ss.end_at >= ?
         AND ss.start_at <= DATE_ADD(?, INTERVAL 5 MINUTE)
       ORDER BY ss.start_at ASC`,
      args
    );

    return (rows || []).map((r) => {
      const fallbackRequired = Number(r?.attendee_user_id || 0) ? Number(r?.is_required || 0) === 1 : Number(r?.supervisor_user_id || 0) !== uid;
      return {
        id: Number(r.id),
        agencyId: Number(r.agency_id),
        sessionType: String(r.session_type || 'individual'),
        startAt: r.start_at,
        endAt: r.end_at,
        status: r.status,
        googleMeetLink: r.google_meet_link || null,
        modality: r.modality || null,
        notes: r.notes || null,
        supervisorUserId: Number(r.supervisor_user_id || 0),
        supervisorName: String(r.supervisor_name || '').trim() || null,
        participantRole: String(r.participant_role || (Number(r.supervisor_user_id || 0) === uid ? 'supervisor' : 'supervisee')),
        isRequired: fallbackRequired
      };
    });
  }

  static async recordAttendanceEvent({
    sessionId,
    attendeeId = null,
    userId = null,
    participantSessionKey,
    eventType,
    eventAt,
    rawPayload = null
  }) {
    const sid = parseInt(sessionId, 10);
    const aid = attendeeId ? parseInt(attendeeId, 10) : null;
    const uid = userId ? parseInt(userId, 10) : null;
    await pool.execute(
      `INSERT INTO supervision_session_attendance_events
        (session_id, attendee_id, user_id, participant_session_key, event_type, event_at, raw_payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [
        sid,
        aid,
        uid,
        String(participantSessionKey || '').trim(),
        String(eventType || '').trim().toLowerCase(),
        eventAt,
        rawPayload ? JSON.stringify(rawPayload) : null
      ]
    );
  }

  static async upsertAttendanceRollup({
    sessionId,
    userId,
    firstJoinedAt = null,
    lastLeftAt = null,
    totalSeconds = 0,
    segmentCount = 0,
    isFinalized = false
  }) {
    const sid = parseInt(sessionId, 10);
    const uid = parseInt(userId, 10);
    await pool.execute(
      `INSERT INTO supervision_session_attendance_rollups
        (session_id, user_id, first_joined_at, last_left_at, total_seconds, segment_count, is_finalized)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         first_joined_at = VALUES(first_joined_at),
         last_left_at = VALUES(last_left_at),
         total_seconds = VALUES(total_seconds),
         segment_count = VALUES(segment_count),
         is_finalized = VALUES(is_finalized),
         updated_at = CURRENT_TIMESTAMP`,
      [
        sid,
        uid,
        firstJoinedAt,
        lastLeftAt,
        Number(totalSeconds || 0),
        Number(segmentCount || 0),
        isFinalized ? 1 : 0
      ]
    );
  }

  static async listAttendanceRollupsForSession(sessionId) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return [];
    const [rows] = await pool.execute(
      `SELECT session_id, user_id, first_joined_at, last_left_at, total_seconds, segment_count, is_finalized
       FROM supervision_session_attendance_rollups
       WHERE session_id = ?
       ORDER BY user_id ASC`,
      [sid]
    );
    return rows || [];
  }

  static async markAttendanceRollupsFinalized(sessionId, isFinalized = true) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return;
    await pool.execute(
      `UPDATE supervision_session_attendance_rollups
       SET is_finalized = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`,
      [isFinalized ? 1 : 0, sid]
    );
  }

  static async clearAttendanceRollups(sessionId) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return;
    await pool.execute(
      `UPDATE supervision_session_attendance_rollups
       SET is_finalized = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`,
      [sid]
    );
  }

  static async setStatus(id, status, extras = {}) {
    const sid = parseInt(id, 10);
    if (!sid) return null;
    const nextStatus = String(status || '').trim().toUpperCase();
    const updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const args = [nextStatus];
    if (Object.prototype.hasOwnProperty.call(extras, 'finalizedAt')) {
      updates.push('finalized_at = ?');
      args.push(extras.finalizedAt || null);
    }
    if (Object.prototype.hasOwnProperty.call(extras, 'finalizedByUserId')) {
      updates.push('finalized_by_user_id = ?');
      args.push(extras.finalizedByUserId ? Number(extras.finalizedByUserId) : null);
    }
    if (Object.prototype.hasOwnProperty.call(extras, 'finalizeSource')) {
      updates.push('finalize_source = ?');
      args.push(extras.finalizeSource ? String(extras.finalizeSource) : null);
    }
    if (Object.prototype.hasOwnProperty.call(extras, 'finalTotalSeconds')) {
      updates.push('final_total_seconds = ?');
      args.push(Number(extras.finalTotalSeconds || 0));
    }
    if (Object.prototype.hasOwnProperty.call(extras, 'supersededBySessionId')) {
      updates.push('superseded_by_session_id = ?');
      args.push(extras.supersededBySessionId ? Number(extras.supersededBySessionId) : null);
    }
    args.push(sid);
    await pool.execute(
      `UPDATE supervision_sessions
       SET ${updates.join(', ')}
       WHERE id = ?`,
      args
    );
    return this.findById(sid);
  }

  static async listAttendanceEventsForSessionUser({ sessionId, userId }) {
    const sid = parseInt(sessionId, 10);
    const uid = parseInt(userId, 10);
    if (!sid || !uid) return [];
    const [rows] = await pool.execute(
      `SELECT event_type, event_at, participant_session_key
       FROM supervision_session_attendance_events
       WHERE session_id = ?
         AND user_id = ?
       ORDER BY event_at ASC, id ASC`,
      [sid, uid]
    );
    return rows || [];
  }

  static async listAttendanceLogsForAgency({
    agencyId,
    startDate = null,
    endDate = null,
    sessionId = null,
    userId = null
  }) {
    const aId = parseInt(agencyId, 10);
    if (!aId) return [];
    const sid = sessionId ? parseInt(sessionId, 10) : null;
    const uid = userId ? parseInt(userId, 10) : null;
    const start = String(startDate || '').slice(0, 10);
    const end = String(endDate || '').slice(0, 10);

    const where = ['ss.agency_id = ?'];
    const params = [aId];
    if (sid) {
      where.push('ss.id = ?');
      params.push(sid);
    }
    if (uid) {
      where.push('ssar.user_id = ?');
      params.push(uid);
    }
    if (start) {
      where.push('DATE(ss.start_at) >= ?');
      params.push(start);
    }
    if (end) {
      where.push('DATE(ss.start_at) <= ?');
      params.push(end);
    }

    const [rows] = await pool.execute(
      `SELECT
         ss.id AS session_id,
         ss.agency_id,
         ss.session_type,
         ss.start_at,
         ss.end_at,
         ss.status AS session_status,
         ss.google_meet_link,
         ssa2.tagged_at AS artifact_tagged_at,
         ssa2.transcript_url AS artifact_transcript_url,
         ssa2.summary_text AS artifact_summary_text,
         ssar.user_id,
         ssar.first_joined_at,
         ssar.last_left_at,
         ssar.total_seconds,
         ssar.segment_count,
         ssar.is_finalized,
         ssa.participant_role,
         ssa.is_required,
         CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS participant_name,
         u.email AS participant_email,
         CONCAT(COALESCE(sup.first_name, ''), ' ', COALESCE(sup.last_name, '')) AS supervisor_name,
         sup.email AS supervisor_email
       FROM supervision_session_attendance_rollups ssar
       JOIN supervision_sessions ss ON ss.id = ssar.session_id
       LEFT JOIN supervision_session_artifacts ssa2 ON ssa2.session_id = ss.id
       LEFT JOIN supervision_session_attendees ssa
         ON ssa.session_id = ssar.session_id
        AND ssa.user_id = ssar.user_id
       LEFT JOIN users u ON u.id = ssar.user_id
       LEFT JOIN users sup ON sup.id = ss.supervisor_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY ss.start_at DESC, ss.id DESC, participant_name ASC`,
      params
    );
    return rows || [];
  }

  static async setPresenters({
    sessionId,
    presenterUserIds = [],
    assignedByUserId = null,
    topicSummaryByUserId = {}
  }) {
    const sid = parseInt(sessionId, 10);
    const presenterIds = Array.from(new Set((presenterUserIds || []).map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0))).slice(0, 2);
    await pool.execute('DELETE FROM supervision_session_presenters WHERE session_id = ?', [sid]);
    if (!presenterIds.length) return;

    const rows = presenterIds.map((uid, idx) => ({
      userId: uid,
      presenterRole: idx === 0 ? 'primary' : 'secondary',
      topicSummary: String(topicSummaryByUserId?.[uid] || '').trim() || null
    }));
    const placeholders = rows.map(() => '(?, ?, ?, ?, ?, NOW())').join(', ');
    const values = rows.flatMap((r) => [
      sid,
      r.userId,
      r.presenterRole,
      r.topicSummary,
      assignedByUserId ? parseInt(assignedByUserId, 10) : null
    ]);
    await pool.execute(
      `INSERT INTO supervision_session_presenters
        (session_id, user_id, presenter_role, topic_summary, assigned_by_user_id, assigned_at)
       VALUES ${placeholders}`,
      values
    );
  }

  static async listPresenterAssignmentsForUser({ userId, agencyId = null, now = new Date() }) {
    const uid = parseInt(userId, 10);
    const nowDate = now instanceof Date ? now : new Date(now);
    if (!uid || Number.isNaN(nowDate.getTime())) return [];
    const whereAgency = Number(agencyId) > 0 ? 'AND ss.agency_id = ?' : '';
    const args = [uid];
    if (Number(agencyId) > 0) args.push(Number(agencyId));

    const [rows] = await pool.execute(
      `SELECT
         sp.id AS presenter_assignment_id,
         sp.session_id,
         sp.user_id,
         sp.presenter_role,
         sp.status AS presenter_status,
         sp.topic_summary,
         ss.agency_id,
         ss.session_type,
         ss.start_at,
         ss.end_at,
         ss.status AS session_status,
         ss.google_meet_link,
         CONCAT(COALESCE(sup.first_name, ''), ' ', COALESCE(sup.last_name, '')) AS supervisor_name
       FROM supervision_session_presenters sp
       JOIN supervision_sessions ss ON ss.id = sp.session_id
       JOIN users sup ON sup.id = ss.supervisor_user_id
       WHERE sp.user_id = ?
         AND (ss.status IS NULL OR ss.status <> 'CANCELLED')
         AND ss.end_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
         ${whereAgency}
       ORDER BY ss.start_at ASC`,
      args
    );
    return rows || [];
  }

  static reminderScheduleForSessionStart(startAtRaw) {
    const start = new Date(startAtRaw);
    if (!Number.isFinite(start.getTime())) return [];
    return [
      { type: 'd7', scheduledFor: new Date(start.getTime() - (7 * 24 * 60 * 60 * 1000)) },
      { type: 'h24', scheduledFor: new Date(start.getTime() - (24 * 60 * 60 * 1000)) },
      { type: 'h1', scheduledFor: new Date(start.getTime() - (60 * 60 * 1000)) }
    ];
  }

  static async ensurePresenterReminders({
    presenterAssignmentId,
    userId,
    agencyId,
    sessionId,
    sessionType,
    supervisorName,
    startAt,
    now = new Date()
  }) {
    const aid = parseInt(presenterAssignmentId, 10);
    const uid = parseInt(userId, 10);
    const agency = parseInt(agencyId, 10);
    const sid = parseInt(sessionId, 10);
    const nowDate = now instanceof Date ? now : new Date(now);
    if (!aid || !uid || !agency || !sid || !Number.isFinite(nowDate.getTime())) return [];

    const schedule = this.reminderScheduleForSessionStart(startAt);
    const sent = [];
    for (const item of schedule) {
      if (!(item.scheduledFor instanceof Date) || !Number.isFinite(item.scheduledFor.getTime())) continue;
      if (item.scheduledFor.getTime() > nowDate.getTime()) continue;

      const [existsRows] = await pool.execute(
        `SELECT id, sent_at
         FROM supervision_presenter_reminders
         WHERE presenter_assignment_id = ? AND reminder_type = ?
         LIMIT 1`,
        [aid, item.type]
      );
      if ((existsRows || []).length && existsRows[0]?.sent_at) continue;

      const whenLabel = item.type === 'd7' ? 'in 7 days' : (item.type === 'h24' ? 'in 24 hours' : 'in 1 hour');
      const title = 'Supervision presenter reminder';
      const message = `You are assigned to present (${sessionType || 'group'} supervision) ${whenLabel}. Session starts at ${new Date(startAt).toLocaleString()} with ${supervisorName || 'your supervisor'}.`;

      const notif = await Notification.create({
        type: 'supervision_presenter_reminder',
        severity: 'info',
        title,
        message,
        userId: uid,
        agencyId: agency,
        relatedEntityType: 'supervision_session',
        relatedEntityId: sid,
        actorSource: 'Supervision'
      });

      if ((existsRows || []).length) {
        await pool.execute(
          `UPDATE supervision_presenter_reminders
           SET scheduled_for = ?, sent_at = NOW(), notification_id = ?, channel = 'in_app'
           WHERE id = ?`,
          [item.scheduledFor, notif?.id || null, existsRows[0].id]
        );
      } else {
        await pool.execute(
          `INSERT INTO supervision_presenter_reminders
            (presenter_assignment_id, reminder_type, scheduled_for, sent_at, notification_id, channel)
           VALUES (?, ?, ?, NOW(), ?, 'in_app')`,
          [aid, item.type, item.scheduledFor, notif?.id || null]
        );
      }
      sent.push({ type: item.type, notificationId: notif?.id || null });
    }
    return sent;
  }

  static async listPresentersForSession(sessionId) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return [];
    const [rows] = await pool.execute(
      `SELECT
         sp.id,
         sp.session_id,
         sp.user_id,
         sp.presenter_role,
         sp.status,
         sp.topic_summary,
         sp.assigned_by_user_id,
         sp.assigned_at,
         sp.confirmed_at,
         sp.presented_at,
         CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS presenter_name,
         u.email AS presenter_email
       FROM supervision_session_presenters sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.session_id = ?
       ORDER BY CASE WHEN sp.presenter_role = 'primary' THEN 0 ELSE 1 END, sp.id ASC`,
      [sid]
    );
    return rows || [];
  }

  static async setPresenterStatus({ sessionId, userId, status }) {
    const sid = parseInt(sessionId, 10);
    const uid = parseInt(userId, 10);
    const next = String(status || '').trim().toLowerCase();
    if (!sid || !uid || !['assigned', 'confirmed', 'presented', 'missed'].includes(next)) return false;
    const [result] = await pool.execute(
      `UPDATE supervision_session_presenters
       SET status = ?,
           confirmed_at = CASE WHEN ? = 'confirmed' THEN NOW() ELSE confirmed_at END,
           presented_at = CASE WHEN ? = 'presented' THEN NOW() ELSE presented_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND user_id = ?`,
      [next, next, next, sid, uid]
    );
    return (result?.affectedRows || 0) > 0;
  }

  static async findById(id) {
    const sid = parseInt(id, 10);
    const [rows] = await pool.execute(
      `SELECT ss.*
       FROM supervision_sessions ss
       WHERE ss.id = ?
       LIMIT 1`,
      [sid]
    );
    return rows[0] || null;
  }

  static async setGoogleSync(id, { hostEmail, calendarId, eventId, meetLink, status, errorMessage }) {
    const sid = parseInt(id, 10);
    await pool.execute(
      `UPDATE supervision_sessions
       SET google_host_email = ?,
           google_calendar_id = ?,
           google_event_id = ?,
           google_meet_link = ?,
           google_sync_status = ?,
           google_sync_error = ?,
           google_synced_at = CASE WHEN ? = 'SYNCED' THEN NOW() ELSE NULL END
       WHERE id = ?`,
      [
        hostEmail || null,
        calendarId || null,
        eventId || null,
        meetLink || null,
        status || null,
        errorMessage || null,
        status || null,
        sid
      ]
    );
    return this.findById(sid);
  }

  static async cancel(id) {
    const sid = parseInt(id, 10);
    await pool.execute(
      `UPDATE supervision_sessions
       SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [sid]
    );
    return this.findById(sid);
  }

  static async updateById(id, {
    startAt,
    endAt,
    sessionType,
    inviteScope,
    inviteAudienceAllSupervised,
    inviteAudienceGroupSupport,
    coFacilitatorUserId,
    modality,
    locationText,
    notes,
    waitingRoomEnabled
  }) {
    const sid = parseInt(id, 10);
    const updates = [];
    const values = [];

    let timingChanged = false;
    if (startAt !== undefined) {
      updates.push('start_at = ?');
      values.push(startAt);
      timingChanged = true;
    }
    if (endAt !== undefined) {
      updates.push('end_at = ?');
      values.push(endAt);
      timingChanged = true;
    }
    if (sessionType !== undefined) {
      updates.push('session_type = ?');
      values.push(String(sessionType || 'individual'));
    }
    if (inviteScope !== undefined) {
      updates.push('invite_scope = ?');
      values.push(normalizeInviteScopeValue(inviteScope));
    }
    if (inviteAudienceAllSupervised !== undefined) {
      updates.push('invite_audience_all_supervised = ?');
      values.push(inviteAudienceAllSupervised ? 1 : 0);
    }
    if (inviteAudienceGroupSupport !== undefined) {
      updates.push('invite_audience_group_support = ?');
      values.push(inviteAudienceGroupSupport ? 1 : 0);
    }
    if (coFacilitatorUserId !== undefined) {
      updates.push('co_facilitator_user_id = ?');
      values.push(Number(coFacilitatorUserId || 0) > 0 ? Number(coFacilitatorUserId) : null);
    }
    if (modality !== undefined) {
      updates.push('modality = ?');
      values.push(modality);
    }
    if (locationText !== undefined) {
      updates.push('location_text = ?');
      values.push(locationText);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }
    if (waitingRoomEnabled !== undefined) {
      updates.push('waiting_room_enabled = ?');
      values.push(waitingRoomEnabled === false || waitingRoomEnabled === 0 ? 0 : 1);
    }

    if (!updates.length) return this.findById(sid);

    await pool.execute(
      `UPDATE supervision_sessions
       SET ${updates.join(', ')}
       WHERE id = ?`,
      [...values, sid]
    );
    if (timingChanged) {
      // Rescheduling interrupts the existing finalization flow.
      await pool.execute(
        `UPDATE supervision_sessions
         SET status = 'SCHEDULED',
             finalized_at = NULL,
             finalized_by_user_id = NULL,
             finalize_source = NULL,
             final_total_seconds = NULL,
             superseded_by_session_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND UPPER(COALESCE(status, 'SCHEDULED')) IN ('FINALIZED', 'MISSED', 'COMPLETED_PENDING_FINALIZE')`,
        [sid]
      );
      await this.clearAttendanceRollups(sid);
    }
    return this.findById(sid);
  }

  static async setVideoRoom(sessionId, { roomSid, uniqueName }) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return null;
    await pool.execute(
      `UPDATE supervision_sessions
       SET twilio_room_sid = ?, twilio_room_unique_name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [roomSid || null, uniqueName || null, sid]
    );
    return this.findById(sid);
  }

  static async setLiveEnded(sessionId, { at = new Date() } = {}) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return null;
    const when = at instanceof Date ? at : new Date(at);
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())} ${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}:${pad(when.getUTCSeconds())}`;
    await pool.execute(
      `UPDATE supervision_sessions
       SET live_ended_at = COALESCE(live_ended_at, ?), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [stamp, sid]
    );
    return this.findById(sid);
  }

  static async listForUserInWindow({ agencyId, allAgencies = false, userId, windowStart, windowEnd }) {
    const uId = parseInt(userId, 10);
    if (!uId || !windowStart || !windowEnd) return [];
    const aId = parseInt(agencyId, 10);
    let agencyClause = 'ss.agency_id = ?';
    let agencyParams = [aId];
    if (allAgencies) {
      agencyClause = '1=1';
      agencyParams = [];
    } else if (!aId) {
      return [];
    }
    const [rows] = await pool.execute(
      `SELECT
         ss.*,
         DATE_FORMAT(ss.start_at, '%Y-%m-%d') AS start_date_ymd,
         sup.first_name AS supervisor_first_name,
         sup.last_name AS supervisor_last_name,
         sup.email AS supervisor_email,
         sv.first_name AS supervisee_first_name,
         sv.last_name AS supervisee_last_name,
         sv.email AS supervisee_email,
         (
           SELECT ssv.is_required
           FROM supervision_session_attendees ssv
           WHERE ssv.session_id = ss.id
             AND ssv.user_id = ?
           LIMIT 1
         ) AS viewer_is_required,
         (
           SELECT GROUP_CONCAT(
             TRIM(CONCAT(COALESCE(u2.first_name, ''), ' ', COALESCE(u2.last_name, '')))
             ORDER BY u2.last_name ASC, u2.first_name ASC
             SEPARATOR ', '
           )
           FROM supervision_session_attendees ssa2
           JOIN users u2 ON u2.id = ssa2.user_id
           WHERE ssa2.session_id = ss.id
             AND ssa2.participant_role = 'supervisee'
         ) AS supervisee_names
         ,
         (
           SELECT ssp.presenter_role
           FROM supervision_session_presenters ssp
           WHERE ssp.session_id = ss.id
             AND ssp.user_id = ?
           LIMIT 1
         ) AS viewer_presenter_role,
         (
           SELECT ssp.status
           FROM supervision_session_presenters ssp
           WHERE ssp.session_id = ss.id
             AND ssp.user_id = ?
           LIMIT 1
         ) AS viewer_presenter_status,
         (
           SELECT GROUP_CONCAT(
             TRIM(CONCAT(COALESCE(u3.first_name, ''), ' ', COALESCE(u3.last_name, '')))
             ORDER BY CASE WHEN ssp2.presenter_role = 'primary' THEN 0 ELSE 1 END, ssp2.id ASC
             SEPARATOR ', '
           )
           FROM supervision_session_presenters ssp2
           JOIN users u3 ON u3.id = ssp2.user_id
           WHERE ssp2.session_id = ss.id
         ) AS presenter_names
       FROM supervision_sessions ss
       JOIN users sup ON sup.id = ss.supervisor_user_id
       LEFT JOIN users sv ON sv.id = ss.supervisee_user_id
       WHERE ${agencyClause}
         AND (
           ss.supervisor_user_id = ?
           OR ss.supervisee_user_id = ?
           OR ss.co_facilitator_user_id = ?
           OR EXISTS (
             SELECT 1
             FROM supervision_session_attendees ssa
             WHERE ssa.session_id = ss.id
               AND ssa.user_id = ?
           )
         )
         AND ss.start_at < ?
         AND ss.end_at > ?
         AND (ss.status IS NULL OR ss.status <> 'CANCELLED')
       ORDER BY ss.start_at ASC`,
      [uId, uId, uId, ...agencyParams, uId, uId, uId, uId, windowEnd, windowStart]
    );
    return rows || [];
  }

  static async listSignupOfferingsForUserInWindow({
    agencyId,
    allAgencies = false,
    userId,
    windowStart,
    windowEnd
  }) {
    const uId = parseInt(userId, 10);
    if (!uId) return [];
    const aId = parseInt(agencyId, 10);
    let agencyClause = 'ss.agency_id = ?';
    let agencyParams = [aId];
    if (allAgencies) {
      agencyClause = '1=1';
      agencyParams = [];
    } else if (!aId) {
      return [];
    }
    try {
      const [rows] = await pool.execute(
        `SELECT
           ss.*,
           DATE_FORMAT(ss.start_at, '%Y-%m-%d') AS start_date_ymd,
           sup.first_name AS supervisor_first_name,
           sup.last_name AS supervisor_last_name,
           sup.email AS supervisor_email,
           sv.first_name AS supervisee_first_name,
           sv.last_name AS supervisee_last_name,
           sv.email AS supervisee_email,
           (
             SELECT ssa.status
             FROM supervision_session_attendees ssa
             WHERE ssa.session_id = ss.id AND ssa.user_id = ?
             LIMIT 1
           ) AS viewer_attendee_status,
           (
             SELECT COUNT(*)
             FROM supervision_session_attendees ssa2
             WHERE ssa2.session_id = ss.id
               AND ssa2.participant_role = 'supervisee'
               AND UPPER(COALESCE(ssa2.status, '')) IN ('SIGNED_UP', 'JOINED', 'INVITED')
           ) AS signup_count
         FROM supervision_sessions ss
         JOIN users sup ON sup.id = ss.supervisor_user_id
         LEFT JOIN users sv ON sv.id = ss.supervisee_user_id
         WHERE ${agencyClause}
           AND LOWER(COALESCE(ss.enrollment_mode, 'invited')) = 'signup_only'
           AND ss.start_at < ?
           AND ss.end_at > ?
           AND (ss.status IS NULL OR ss.status <> 'CANCELLED')
           AND NOT (
             ss.supervisor_user_id = ?
             OR ss.co_facilitator_user_id = ?
             OR EXISTS (
               SELECT 1 FROM supervision_session_attendees ssa0
               WHERE ssa0.session_id = ss.id AND ssa0.user_id = ?
             )
           )
         ORDER BY ss.start_at ASC`,
        [uId, ...agencyParams, windowEnd, windowStart, uId, uId, uId]
      );
      return rows || [];
    } catch (e) {
      if (!/enrollment_mode/i.test(String(e?.message || ''))) throw e;
      return [];
    }
  }

  /**
   * Hybrid open-join group sessions: invite_audience_* flags allow matching agency members
   * who were not named invitees to see/join from My Schedule.
   */
  static async listOpenJoinOfferingsForUserInWindow({
    agencyId,
    allAgencies = false,
    userId,
    windowStart,
    windowEnd
  }) {
    const uId = parseInt(userId, 10);
    if (!uId) return [];
    const aId = parseInt(agencyId, 10);
    let agencyClause = 'ss.agency_id = ?';
    let agencyParams = [aId];
    if (allAgencies) {
      agencyClause = '1=1';
      agencyParams = [];
    } else if (!aId) {
      return [];
    }
    try {
      const [rows] = await pool.execute(
        `SELECT
           ss.*,
           DATE_FORMAT(ss.start_at, '%Y-%m-%d') AS start_date_ymd,
           sup.first_name AS supervisor_first_name,
           sup.last_name AS supervisor_last_name,
           sup.email AS supervisor_email,
           sv.first_name AS supervisee_first_name,
           sv.last_name AS supervisee_last_name,
           sv.email AS supervisee_email,
           (
             SELECT ssa.status
             FROM supervision_session_attendees ssa
             WHERE ssa.session_id = ss.id AND ssa.user_id = ?
             LIMIT 1
           ) AS viewer_attendee_status,
           (
             SELECT COUNT(*)
             FROM supervision_session_attendees ssa2
             WHERE ssa2.session_id = ss.id
               AND ssa2.participant_role = 'supervisee'
               AND UPPER(COALESCE(ssa2.status, '')) IN ('SIGNED_UP', 'JOINED', 'INVITED')
           ) AS signup_count,
           1 AS is_open_join_offering
         FROM supervision_sessions ss
         JOIN users sup ON sup.id = ss.supervisor_user_id
         LEFT JOIN users sv ON sv.id = ss.supervisee_user_id
         JOIN user_agencies ua
           ON ua.agency_id = ss.agency_id
          AND ua.user_id = ?
         WHERE ${agencyClause}
           AND LOWER(COALESCE(ss.session_type, '')) = 'group'
           AND LOWER(COALESCE(ss.enrollment_mode, 'invited')) <> 'signup_only'
           AND (
             ss.invite_audience_all_supervised = 1
             OR ss.invite_audience_group_support = 1
             OR LOWER(COALESCE(ss.invite_scope, '')) IN ('open_to_all', 'open_and_invited')
           )
           AND (
             (
               ss.invite_audience_all_supervised = 1
               AND ua.supervision_is_prelicensed = 1
             )
             OR (
               ss.invite_audience_group_support = 1
               AND ua.supervision_is_prelicensed = 1
               AND COALESCE(ua.supervision_start_group_hours, 0) > 0
             )
             OR (
               ss.invite_audience_all_supervised <> 1
               AND ss.invite_audience_group_support <> 1
               AND LOWER(COALESCE(ss.invite_scope, '')) IN ('open_to_all', 'open_and_invited')
               AND EXISTS (
                 SELECT 1
                 FROM supervisor_assignments sa
                 WHERE sa.supervisor_id = ss.supervisor_user_id
                   AND sa.supervisee_id = ?
                   AND sa.agency_id = ss.agency_id
               )
             )
           )
           AND ss.start_at < ?
           AND ss.end_at > ?
           AND (ss.status IS NULL OR ss.status <> 'CANCELLED')
           AND NOT (
             ss.supervisor_user_id = ?
             OR ss.co_facilitator_user_id = ?
             OR ss.supervisee_user_id = ?
             OR EXISTS (
               SELECT 1 FROM supervision_session_attendees ssa0
               WHERE ssa0.session_id = ss.id AND ssa0.user_id = ?
             )
           )
         ORDER BY ss.start_at ASC`,
        [uId, uId, ...agencyParams, uId, windowEnd, windowStart, uId, uId, uId, uId]
      );
      return rows || [];
    } catch (e) {
      // Older schemas may lack audience columns — treat as no open-join offerings.
      if (/invite_audience|invite_scope|enrollment_mode|Unknown column/i.test(String(e?.message || ''))) {
        return [];
      }
      throw e;
    }
  }

  /**
   * List supervision sessions for a supervisee (past and upcoming) with artifacts.
   * Used for "My supervision" tab and dashboard.
   */
  static async listSessionsForSuperviseeWithArtifacts({ superviseeUserId, agencyId = null, limit = 50 }) {
    const uid = parseInt(superviseeUserId, 10);
    if (!uid) return [];
    const aId = Number(agencyId) > 0 ? Number(agencyId) : null;
    const lim = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(200, Math.floor(Number(limit))) : 50;
    const whereAgency = aId ? `AND ss.agency_id = ${aId}` : '';

    // NOTE: Inline validated integers here to avoid intermittent driver/proxy prepared-statement
    // argument mismatches observed in production (mysqld_stmt_execute).
    const [rows] = await pool.execute(
      `SELECT
         ss.id,
         ss.agency_id,
         ss.session_type,
         ss.start_at,
         ss.end_at,
         ss.status,
         ss.google_meet_link,
         ss.twilio_room_unique_name,
         ss.modality,
         ss.notes,
         ss.supervisor_user_id,
         CONCAT(COALESCE(sup.first_name, ''), ' ', COALESCE(sup.last_name, '')) AS supervisor_name,
         ssa2.transcript_url,
         ssa2.transcript_text,
         ssa2.summary_text,
         ssa2.summary_model,
         ssa2.summary_generated_at,
         ssa2.focus_title,
         ssa2.goals_json,
         ssa2.action_items_json,
         ssa2.private_notes_text,
         ssa2.sensitive_ciphertext,
         ssa2.sensitive_iv,
         ssa2.sensitive_auth_tag,
         ssa2.encryption_key_id,
         ssar.first_joined_at,
         ssar.last_left_at,
         ssar.total_seconds,
         ssar.segment_count,
         ssar.is_finalized,
         ss.finalized_at,
         ss.finalized_by_user_id,
         ss.finalize_source,
         ss.final_total_seconds,
         sshc.source_json AS hour_credit_source_json,
         sshc.individual_hours AS hour_credit_individual,
         sshc.group_hours AS hour_credit_group
       FROM supervision_sessions ss
       JOIN users sup ON sup.id = ss.supervisor_user_id
       LEFT JOIN supervision_session_artifacts ssa2 ON ssa2.session_id = ss.id
       LEFT JOIN supervision_session_attendance_rollups ssar
         ON ssar.session_id = ss.id
        AND ssar.user_id = ${uid}
       LEFT JOIN supervision_session_hour_credits sshc
         ON sshc.session_id = ss.id
        AND sshc.user_id = ${uid}
       WHERE (
          ss.supervisee_user_id = ${uid}
           OR EXISTS (
             SELECT 1 FROM supervision_session_attendees ssa
            WHERE ssa.session_id = ss.id AND ssa.user_id = ${uid} AND ssa.participant_role = 'supervisee'
           )
         )
         ${whereAgency}
         AND (ss.status IS NULL OR ss.status <> 'CANCELLED')
       ORDER BY ss.start_at DESC
       LIMIT ${lim}`
    );

    return (rows || []).map((r) => {
      let hourSrc = r.hour_credit_source_json;
      if (typeof hourSrc === 'string') {
        try { hourSrc = JSON.parse(hourSrc); } catch { hourSrc = {}; }
      }
      if (!hourSrc || typeof hourSrc !== 'object') hourSrc = {};
      const attendedSnap = Number(hourSrc.hoursAttended);
      const beforeSnap = Number(hourSrc.hoursBefore);
      const afterSnap = Number(hourSrc.hoursAfter);
      const fallbackAttended = Math.round(
        ((Number(r.hour_credit_individual || 0) + Number(r.hour_credit_group || 0))
          || (Number(r.total_seconds || 0) / 3600)) * 100
      ) / 100;
      return {
        id: Number(r.id),
        agencyId: Number(r.agency_id),
        sessionType: String(r.session_type || 'individual'),
        startAt: r.start_at,
        endAt: r.end_at,
        status: r.status,
        googleMeetLink: r.google_meet_link || null,
        twilioRoomUniqueName: r.twilio_room_unique_name || null,
        modality: r.modality || null,
        notes: r.notes || null,
        supervisorUserId: Number(r.supervisor_user_id || 0),
        supervisorName: String(r.supervisor_name || '').trim() || null,
        ...(() => {
          const plain = resolveArtifactPlainFields(r);
          return {
            transcriptUrl: plain.transcriptUrl || null,
            transcriptText: plain.transcriptText || null,
            summaryText: plain.summaryText || null,
            focusTitle: plain.focusTitle || null,
            goals: Array.isArray(plain.goals) ? plain.goals : [],
            actionItems: Array.isArray(plain.actionItems) ? plain.actionItems : [],
            isEncrypted: !!plain.isEncrypted
          };
        })(),
        summaryModel: r.summary_model || null,
        summaryGeneratedAt: r.summary_generated_at || null,
        firstJoinedAt: r.first_joined_at || null,
        lastLeftAt: r.last_left_at || null,
        totalSeconds: Number(r.total_seconds || 0),
        totalHours: Math.round((Number(r.total_seconds || 0) / 3600) * 100) / 100,
        segmentCount: Number(r.segment_count || 0),
        isFinalized: Number(r.is_finalized || 0) === 1,
        sessionFinalizedAt: r.finalized_at || null,
        sessionFinalizeSource: r.finalize_source || null,
        sessionFinalTotalSeconds: r.final_total_seconds == null ? null : Number(r.final_total_seconds || 0),
        sessionFinalizedByUserId: r.finalized_by_user_id ? Number(r.finalized_by_user_id) : null,
        hoursBefore: Number.isFinite(beforeSnap) ? beforeSnap : null,
        hoursAttended: Number.isFinite(attendedSnap) ? attendedSnap : (r.hour_credit_individual != null ? fallbackAttended : null),
        hoursAfter: Number.isFinite(afterSnap) ? afterSnap : null
      };
    });
  }

  /**
   * List sessions where the user is the supervisor (or co-facilitator), with decrypted artifacts.
   */
  static async listSessionsForSupervisorWithArtifacts({ supervisorUserId, agencyId = null, limit = 50 }) {
    const uid = parseInt(supervisorUserId, 10);
    if (!uid) return [];
    const aId = Number(agencyId) > 0 ? Number(agencyId) : null;
    const lim = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(200, Math.floor(Number(limit))) : 50;
    const whereAgency = aId ? `AND ss.agency_id = ${aId}` : '';

    const [rows] = await pool.execute(
      `SELECT
         ss.id,
         ss.agency_id,
         ss.session_type,
         ss.start_at,
         ss.end_at,
         ss.status,
         ss.google_meet_link,
         ss.twilio_room_unique_name,
         ss.modality,
         ss.notes,
         ss.supervisor_user_id,
         ss.supervisee_user_id,
         CONCAT(COALESCE(se.first_name, ''), ' ', COALESCE(se.last_name, '')) AS supervisee_name,
         ssa2.transcript_url,
         ssa2.transcript_text,
         ssa2.summary_text,
         ssa2.summary_model,
         ssa2.summary_generated_at,
         ssa2.focus_title,
         ssa2.goals_json,
         ssa2.action_items_json,
         ssa2.private_notes_text,
         ssa2.sensitive_ciphertext,
         ssa2.sensitive_iv,
         ssa2.sensitive_auth_tag,
         ssa2.encryption_key_id,
         ssar.first_joined_at,
         ssar.last_left_at,
         ssar.total_seconds,
         ssar.segment_count,
         ssar.is_finalized,
         ss.finalized_at,
         ss.finalized_by_user_id,
         ss.finalize_source,
         ss.final_total_seconds
       FROM supervision_sessions ss
       LEFT JOIN users se ON se.id = ss.supervisee_user_id
       LEFT JOIN supervision_session_artifacts ssa2 ON ssa2.session_id = ss.id
       LEFT JOIN supervision_session_attendance_rollups ssar
         ON ssar.session_id = ss.id
        AND ssar.user_id = ${uid}
       WHERE (
          ss.supervisor_user_id = ${uid}
          OR ss.co_facilitator_user_id = ${uid}
         )
         ${whereAgency}
         AND (ss.status IS NULL OR ss.status <> 'CANCELLED')
       ORDER BY ss.start_at DESC
       LIMIT ${lim}`
    );

    return (rows || []).map((r) => {
      const plain = resolveArtifactPlainFields(r);
      return {
        id: Number(r.id),
        agencyId: Number(r.agency_id),
        sessionType: String(r.session_type || 'individual'),
        startAt: r.start_at,
        endAt: r.end_at,
        status: r.status,
        googleMeetLink: r.google_meet_link || null,
        twilioRoomUniqueName: r.twilio_room_unique_name || null,
        modality: r.modality || null,
        notes: r.notes || null,
        supervisorUserId: Number(r.supervisor_user_id || 0),
        superviseeUserId: Number(r.supervisee_user_id || 0) || null,
        superviseeName: String(r.supervisee_name || '').trim() || null,
        role: 'supervisor',
        transcriptUrl: plain.transcriptUrl || null,
        transcriptText: plain.transcriptText || null,
        summaryText: plain.summaryText || null,
        summaryModel: r.summary_model || null,
        summaryGeneratedAt: r.summary_generated_at || null,
        focusTitle: plain.focusTitle || null,
        goals: Array.isArray(plain.goals) ? plain.goals : [],
        actionItems: Array.isArray(plain.actionItems) ? plain.actionItems : [],
        isEncrypted: !!plain.isEncrypted,
        firstJoinedAt: r.first_joined_at || null,
        lastLeftAt: r.last_left_at || null,
        totalSeconds: Number(r.total_seconds || 0),
        totalHours: Math.round((Number(r.total_seconds || 0) / 3600) * 100) / 100,
        segmentCount: Number(r.segment_count || 0),
        isFinalized: Number(r.is_finalized || 0) === 1,
        sessionFinalizedAt: r.finalized_at || null,
        sessionFinalizeSource: r.finalize_source || null,
        sessionFinalTotalSeconds: r.final_total_seconds == null ? null : Number(r.final_total_seconds || 0),
        sessionFinalizedByUserId: r.finalized_by_user_id ? Number(r.finalized_by_user_id) : null
      };
    });
  }

  /**
   * Get total completed/scheduled supervision hours for a supervisee in an agency.
   * Sums (end_at - start_at) for sessions where supervisee_user_id = superviseeUserId, agency_id = agencyId, status <> 'CANCELLED'.
   */
  static async getHoursSummaryForSupervisee(agencyId, superviseeUserId) {
    const aId = parseInt(agencyId, 10);
    const uId = parseInt(superviseeUserId, 10);
    const [rows] = await pool.execute(
      `SELECT
         COALESCE(SUM(ssar.total_seconds), 0) AS total_seconds,
         COUNT(DISTINCT ss.id) AS session_count
       FROM supervision_session_attendance_rollups ssar
       JOIN supervision_sessions ss ON ss.id = ssar.session_id
       WHERE ss.agency_id = ?
         AND ssar.user_id = ?
         AND COALESCE(ssar.total_seconds, 0) > 0
         AND (
           UPPER(COALESCE(ss.status, 'SCHEDULED')) = 'FINALIZED'
           OR (ss.finalized_at IS NULL AND UPPER(COALESCE(ss.status, 'SCHEDULED')) NOT IN ('CANCELLED', 'MISSED', 'RESCHEDULED'))
         )`,
      [aId, uId]
    );
    const r = rows?.[0] || null;
    const totalSeconds = Number(r?.total_seconds || 0);
    const totalHours = totalSeconds / 3600;
    return {
      totalSeconds,
      totalHours: Math.round(totalHours * 100) / 100,
      sessionCount: Number(r?.session_count || 0)
    };
  }
}

export default SupervisionSession;

