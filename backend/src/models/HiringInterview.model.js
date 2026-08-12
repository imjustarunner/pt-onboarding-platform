import crypto from 'crypto';
import pool from '../config/database.js';

function parseIntParam(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseJsonMaybe(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function toJsonParam(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function toSqlDatetime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const ALLOWED_STATUSES = new Set(['scheduled', 'in_progress', 'completed', 'cancelled']);

class HiringInterview {
  static newJoinToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  static hydrate(row) {
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id),
      agency_id: Number(row.agency_id),
      candidate_user_id: Number(row.candidate_user_id),
      hiring_profile_id: row.hiring_profile_id != null ? Number(row.hiring_profile_id) : null,
      provider_schedule_event_id: row.provider_schedule_event_id != null ? Number(row.provider_schedule_event_id) : null,
      template_id: row.template_id != null ? Number(row.template_id) : null,
      job_question_set_id: row.job_question_set_id != null ? Number(row.job_question_set_id) : null,
      interviewer_user_ids_json: parseJsonMaybe(row.interviewer_user_ids_json, [])
    };
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM hiring_interviews WHERE id = ? LIMIT 1`,
      [parseIntParam(id)]
    );
    return this.hydrate(rows[0] || null);
  }

  static async findByScheduleEventId(eventId) {
    const eid = parseIntParam(eventId);
    if (!eid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM hiring_interviews
       WHERE provider_schedule_event_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [eid]
    );
    return this.hydrate(rows[0] || null);
  }

  static async listByAgencyId(agencyId, { status = null, limit = 200 } = {}) {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
    const clauses = ['agency_id = ?'];
    const params = [parseIntParam(agencyId)];
    if (status) {
      clauses.push('status = ?');
      params.push(String(status).trim().toLowerCase());
    }
    const [rows] = await pool.execute(
      `SELECT * FROM hiring_interviews
       WHERE ${clauses.join(' AND ')}
       ORDER BY interview_starts_at DESC, id DESC
       LIMIT ${lim}`,
      params
    );
    return (rows || []).map((r) => this.hydrate(r));
  }

  static async listByCandidateUserId(candidateUserId, { agencyId = null, limit = 100 } = {}) {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const clauses = ['candidate_user_id = ?'];
    const params = [parseIntParam(candidateUserId)];
    if (agencyId != null) {
      clauses.push('agency_id = ?');
      params.push(parseIntParam(agencyId));
    }
    const [rows] = await pool.execute(
      `SELECT * FROM hiring_interviews
       WHERE ${clauses.join(' AND ')}
       ORDER BY interview_starts_at DESC, id DESC
       LIMIT ${lim}`,
      params
    );
    return (rows || []).map((r) => this.hydrate(r));
  }

  static async create({
    agencyId,
    candidateUserId,
    hiringProfileId = null,
    providerScheduleEventId = null,
    templateId = null,
    jobQuestionSetId = null,
    status = 'scheduled',
    interviewStartsAt = null,
    interviewTimezone = null,
    interviewerUserIds = null,
    guestJoinToken = null,
    hostJoinToken = null,
    inviteSentAt = null,
    publicJoinUrl = null,
    interviewRound = null,
    displayTitle = null,
    createdByUserId = null
  }) {
    const statusNorm = String(status || 'scheduled').trim().toLowerCase();
    const safeStatus = ALLOWED_STATUSES.has(statusNorm) ? statusNorm : 'scheduled';
    const guestTok = guestJoinToken || this.newJoinToken();
    const hostTok = hostJoinToken || this.newJoinToken();

    const [result] = await pool.execute(
      `INSERT INTO hiring_interviews (
        agency_id, candidate_user_id, hiring_profile_id, provider_schedule_event_id,
        template_id, job_question_set_id, status, interview_starts_at, interview_timezone,
        interviewer_user_ids_json, guest_join_token, host_join_token,
        invite_sent_at, public_join_url, interview_round, display_title, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseIntParam(agencyId),
        parseIntParam(candidateUserId),
        hiringProfileId != null ? parseIntParam(hiringProfileId) : null,
        providerScheduleEventId != null ? parseIntParam(providerScheduleEventId) : null,
        templateId != null ? parseIntParam(templateId) : null,
        jobQuestionSetId != null ? parseIntParam(jobQuestionSetId) : null,
        safeStatus,
        toSqlDatetime(interviewStartsAt),
        interviewTimezone != null ? String(interviewTimezone).trim().slice(0, 64) : null,
        toJsonParam(interviewerUserIds ?? []),
        String(guestTok).slice(0, 128),
        String(hostTok).slice(0, 128),
        toSqlDatetime(inviteSentAt),
        publicJoinUrl != null ? String(publicJoinUrl) : null,
        interviewRound != null ? String(interviewRound).trim().slice(0, 32) : null,
        displayTitle != null ? String(displayTitle).trim().slice(0, 255) : null,
        parseIntParam(createdByUserId)
      ]
    );
    return this.findById(result.insertId);
  }

  static async updateById(id, patch = {}) {
    const updates = [];
    const params = [];

    if (patch.hiringProfileId !== undefined) {
      updates.push('hiring_profile_id = ?');
      params.push(patch.hiringProfileId != null ? parseIntParam(patch.hiringProfileId) : null);
    }
    if (patch.providerScheduleEventId !== undefined) {
      updates.push('provider_schedule_event_id = ?');
      params.push(patch.providerScheduleEventId != null ? parseIntParam(patch.providerScheduleEventId) : null);
    }
    if (patch.templateId !== undefined) {
      updates.push('template_id = ?');
      params.push(patch.templateId != null ? parseIntParam(patch.templateId) : null);
    }
    if (patch.jobQuestionSetId !== undefined) {
      updates.push('job_question_set_id = ?');
      params.push(patch.jobQuestionSetId != null ? parseIntParam(patch.jobQuestionSetId) : null);
    }
    if (patch.status !== undefined) {
      const statusNorm = String(patch.status || '').trim().toLowerCase();
      if (ALLOWED_STATUSES.has(statusNorm)) {
        updates.push('status = ?');
        params.push(statusNorm);
      }
    }
    if (patch.interviewStartsAt !== undefined) {
      updates.push('interview_starts_at = ?');
      params.push(toSqlDatetime(patch.interviewStartsAt));
    }
    if (patch.interviewTimezone !== undefined) {
      updates.push('interview_timezone = ?');
      params.push(patch.interviewTimezone != null ? String(patch.interviewTimezone).trim().slice(0, 64) : null);
    }
    if (patch.interviewerUserIds !== undefined) {
      updates.push('interviewer_user_ids_json = ?');
      params.push(toJsonParam(patch.interviewerUserIds));
    }
    if (patch.guestJoinToken !== undefined) {
      updates.push('guest_join_token = ?');
      params.push(patch.guestJoinToken != null ? String(patch.guestJoinToken).slice(0, 128) : null);
    }
    if (patch.hostJoinToken !== undefined) {
      updates.push('host_join_token = ?');
      params.push(patch.hostJoinToken != null ? String(patch.hostJoinToken).slice(0, 128) : null);
    }
    if (patch.inviteSentAt !== undefined) {
      updates.push('invite_sent_at = ?');
      params.push(toSqlDatetime(patch.inviteSentAt));
    }
    if (patch.publicJoinUrl !== undefined) {
      updates.push('public_join_url = ?');
      params.push(patch.publicJoinUrl != null ? String(patch.publicJoinUrl) : null);
    }
    if (patch.interviewRound !== undefined) {
      updates.push('interview_round = ?');
      params.push(patch.interviewRound != null ? String(patch.interviewRound).trim().slice(0, 32) : null);
    }
    if (patch.displayTitle !== undefined) {
      updates.push('display_title = ?');
      params.push(patch.displayTitle != null ? String(patch.displayTitle).trim().slice(0, 255) : null);
    }
    if (patch.guestAccessEndedAt !== undefined) {
      updates.push('guest_access_ended_at = ?');
      params.push(toSqlDatetime(patch.guestAccessEndedAt));
    }
    if (patch.guestAccessEndedByUserId !== undefined) {
      updates.push('guest_access_ended_by_user_id = ?');
      params.push(
        patch.guestAccessEndedByUserId != null ? parseIntParam(patch.guestAccessEndedByUserId) : null
      );
    }

    if (!updates.length) return this.findById(id);

    params.push(parseIntParam(id));
    await pool.execute(
      `UPDATE hiring_interviews SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return this.findById(id);
  }
}

export default HiringInterview;
