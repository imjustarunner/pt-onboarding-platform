import pool from '../config/database.js';
import LearningProgramClass from './LearningProgramClass.model.js';

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
};

const parseJsonMaybe = (raw) => {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalize = (row) => {
  if (!row) return null;
  return {
    ...row,
    metadata_json: parseJsonMaybe(row.metadata_json)
  };
};

class LearningClassSession {
  static async create({ classId, title, description = null, mode = 'group', startsAt = null, createdByUserId = null }) {
    const [result] = await pool.execute(
      `INSERT INTO learning_class_sessions
       (learning_class_id, title, description, mode, starts_at, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [classId, title, description, mode, startsAt, createdByUserId]
    );
    return this.findById(result.insertId);
  }

  static async findById(sessionId) {
    const id = asInt(sessionId);
    if (!id) return null;
    const [rows] = await pool.execute(
      `SELECT s.*, c.class_name, c.organization_id, c.organization_slug, c.organization_type
       FROM learning_class_sessions s
       JOIN (
         SELECT lpc.id, lpc.class_name, a.id AS organization_id, a.slug AS organization_slug, a.organization_type
         FROM learning_program_classes lpc
         JOIN agencies a ON a.id = lpc.organization_id
       ) c ON c.id = s.learning_class_id
       WHERE s.id = ?
       LIMIT 1`,
      [id]
    );
    return normalize(rows?.[0] || null);
  }

  static async listByClassId(classId) {
    const cid = asInt(classId);
    if (!cid) return [];
    const [rows] = await pool.execute(
      `SELECT s.*, lpc.class_name
       FROM learning_class_sessions s
       JOIN learning_program_classes lpc ON lpc.id = s.learning_class_id
       WHERE s.learning_class_id = ?
       ORDER BY COALESCE(s.starts_at, s.created_at) DESC, s.id DESC`,
      [cid]
    );
    return (rows || []).map(normalize);
  }

  static async update(sessionId, patch = {}) {
    const id = asInt(sessionId);
    if (!id) return null;
    const map = {
      title: 'title',
      description: 'description',
      mode: 'mode',
      status: 'status',
      startsAt: 'starts_at',
      endsAt: 'ends_at',
      twilioRoomSid: 'twilio_room_sid',
      twilioRoomUniqueName: 'twilio_room_unique_name',
      startedByUserId: 'started_by_user_id',
      endedByUserId: 'ended_by_user_id'
    };
    const set = [];
    const values = [];
    for (const [k, col] of Object.entries(map)) {
      if (patch[k] === undefined) continue;
      set.push(`${col} = ?`);
      values.push(patch[k]);
    }
    if (!set.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE learning_class_sessions SET ${set.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async upsertParticipantRole({
    sessionId,
    userId,
    role = 'participant',
    canUnmuteParticipants = false,
    canEnableParticipantVideo = false,
    canManageSlides = false,
    canManagePolls = false
  }) {
    await pool.execute(
      `INSERT INTO learning_class_session_participants
       (session_id, user_id, role, can_unmute_participants, can_enable_participant_video, can_manage_slides, can_manage_polls)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         role = VALUES(role),
         can_unmute_participants = VALUES(can_unmute_participants),
         can_enable_participant_video = VALUES(can_enable_participant_video),
         can_manage_slides = VALUES(can_manage_slides),
         can_manage_polls = VALUES(can_manage_polls)`,
      [
        sessionId,
        userId,
        role,
        canUnmuteParticipants ? 1 : 0,
        canEnableParticipantVideo ? 1 : 0,
        canManageSlides ? 1 : 0,
        canManagePolls ? 1 : 0
      ]
    );
  }

  static async listParticipantRoles(sessionId) {
    const sid = asInt(sessionId);
    if (!sid) return [];
    const [rows] = await pool.execute(
      `SELECT p.*, u.first_name, u.last_name, u.role AS user_role
       FROM learning_class_session_participants p
       JOIN users u ON u.id = p.user_id
       WHERE p.session_id = ?
       ORDER BY FIELD(p.role, 'presenter', 'co_presenter', 'proctor', 'participant'), u.last_name, u.first_name`,
      [sid]
    );
    return rows || [];
  }

  static async getRoleForUser(sessionId, userId) {
    const sid = asInt(sessionId);
    const uid = asInt(userId);
    if (!sid || !uid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_class_session_participants
       WHERE session_id = ? AND user_id = ?
       LIMIT 1`,
      [sid, uid]
    );
    return rows?.[0] || null;
  }

  static async markParticipantJoined(sessionId, userId) {
    await pool.execute(
      `UPDATE learning_class_session_participants
       SET joined_at = COALESCE(joined_at, UTC_TIMESTAMP()), left_at = NULL
       WHERE session_id = ? AND user_id = ?`,
      [sessionId, userId]
    );
  }

  static async addSlide({
    sessionId,
    slideOrder = 0,
    title = null,
    bodyText = null,
    mediaUrl = null,
    linkedAssignmentId = null,
    linkedResourceId = null,
    metadataJson = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO learning_class_session_slides
       (session_id, slide_order, title, body_text, media_url, linked_assignment_id, linked_resource_id, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        slideOrder,
        title,
        bodyText,
        mediaUrl,
        linkedAssignmentId,
        linkedResourceId,
        metadataJson ? JSON.stringify(metadataJson) : null,
        createdByUserId
      ]
    );
    return this.getSlideById(result.insertId);
  }

  static async updateSlide(slideId, patch = {}) {
    const id = asInt(slideId);
    if (!id) return null;
    const map = {
      slideOrder: 'slide_order',
      title: 'title',
      bodyText: 'body_text',
      mediaUrl: 'media_url',
      linkedAssignmentId: 'linked_assignment_id',
      linkedResourceId: 'linked_resource_id',
      isActive: 'is_active'
    };
    const set = [];
    const values = [];
    for (const [k, col] of Object.entries(map)) {
      if (patch[k] === undefined) continue;
      set.push(`${col} = ?`);
      values.push(k === 'isActive' ? (patch[k] ? 1 : 0) : patch[k]);
    }
    if (patch.metadataJson !== undefined) {
      set.push('metadata_json = ?');
      values.push(patch.metadataJson ? JSON.stringify(patch.metadataJson) : null);
    }
    if (!set.length) return this.getSlideById(id);
    values.push(id);
    await pool.execute(`UPDATE learning_class_session_slides SET ${set.join(', ')} WHERE id = ?`, values);
    return this.getSlideById(id);
  }

  static async listSlides(sessionId) {
    const sid = asInt(sessionId);
    if (!sid) return [];
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_class_session_slides
       WHERE session_id = ? AND is_active = 1
       ORDER BY slide_order ASC, id ASC`,
      [sid]
    );
    return (rows || []).map(normalize);
  }

  static async getSlideById(slideId) {
    const id = asInt(slideId);
    if (!id) return null;
    const [rows] = await pool.execute(`SELECT * FROM learning_class_session_slides WHERE id = ? LIMIT 1`, [id]);
    return normalize(rows?.[0] || null);
  }

  static async upsertSessionState({ sessionId, currentSlideId = null, currentSlideOrder = 0, linkedDocumentUrl = null, presenterUserId = null, metadataJson = null, updatedByUserId = null }) {
    await pool.execute(
      `INSERT INTO learning_class_session_state
       (session_id, current_slide_id, current_slide_order, linked_document_url, presenter_user_id, metadata_json, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         current_slide_id = VALUES(current_slide_id),
         current_slide_order = VALUES(current_slide_order),
         linked_document_url = VALUES(linked_document_url),
         presenter_user_id = VALUES(presenter_user_id),
         metadata_json = VALUES(metadata_json),
         updated_by_user_id = VALUES(updated_by_user_id)`,
      [
        sessionId,
        currentSlideId,
        currentSlideOrder,
        linkedDocumentUrl,
        presenterUserId,
        metadataJson ? JSON.stringify(metadataJson) : null,
        updatedByUserId
      ]
    );
    const [rows] = await pool.execute(`SELECT * FROM learning_class_session_state WHERE session_id = ? LIMIT 1`, [sessionId]);
    return normalize(rows?.[0] || null);
  }

  static async getSessionState(sessionId) {
    const sid = asInt(sessionId);
    if (!sid) return null;
    const [rows] = await pool.execute(`SELECT * FROM learning_class_session_state WHERE session_id = ? LIMIT 1`, [sid]);
    return normalize(rows?.[0] || null);
  }

  static async createHandRaise({ sessionId, userId, note = null, requestedCamera = false }) {
    const [result] = await pool.execute(
      `INSERT INTO learning_class_session_hand_raises
       (session_id, user_id, status, note, requested_camera)
       VALUES (?, ?, 'raised', ?, ?)`,
      [sessionId, userId, note, requestedCamera ? 1 : 0]
    );
    return this.getHandRaiseById(result.insertId);
  }

  static async resolveHandRaise({ handRaiseId, status, approvedAudio = false, approvedVideo = false, approvedByUserId = null }) {
    const id = asInt(handRaiseId);
    if (!id) return null;
    const isApproved = String(status) === 'approved';
    await pool.execute(
      `UPDATE learning_class_session_hand_raises
       SET status = ?,
           approved_audio = ?,
           approved_video = ?,
           approved_by_user_id = ?,
           approved_at = CASE WHEN ? THEN UTC_TIMESTAMP() ELSE approved_at END,
           resolved_at = CASE WHEN ? IN ('dismissed','answered') THEN UTC_TIMESTAMP() ELSE resolved_at END
       WHERE id = ?`,
      [status, approvedAudio ? 1 : 0, approvedVideo ? 1 : 0, approvedByUserId, isApproved ? 1 : 0, status, id]
    );
    return this.getHandRaiseById(id);
  }

  static async listHandRaises(sessionId) {
    const sid = asInt(sessionId);
    if (!sid) return [];
    const [rows] = await pool.execute(
      `SELECT hr.*, u.first_name, u.last_name
       FROM learning_class_session_hand_raises hr
       JOIN users u ON u.id = hr.user_id
       WHERE hr.session_id = ?
       ORDER BY FIELD(hr.status, 'raised', 'approved', 'answered', 'dismissed'), hr.created_at ASC`,
      [sid]
    );
    return rows || [];
  }

  static async getHandRaiseById(handRaiseId) {
    const id = asInt(handRaiseId);
    if (!id) return null;
    const [rows] = await pool.execute(`SELECT * FROM learning_class_session_hand_raises WHERE id = ? LIMIT 1`, [id]);
    return rows?.[0] || null;
  }

  static async createActivity({ sessionId, userId = null, participantIdentity, activityType, payload = {} }) {
    const [result] = await pool.execute(
      `INSERT INTO learning_class_session_activity
       (session_id, user_id, participant_identity, activity_type, payload_json)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, userId, participantIdentity, activityType, JSON.stringify(payload || {})]
    );
    return result.insertId;
  }

  static async listActivity(sessionId, limit = 500) {
    const sid = asInt(sessionId);
    if (!sid) return [];
    const lim = Math.min(Math.max(asInt(limit) || 500, 1), 1000);
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_class_session_activity
       WHERE session_id = ?
       ORDER BY created_at ASC
       LIMIT ?`,
      [sid, lim]
    );
    return (rows || []).map((row) => ({ ...row, payload_json: parseJsonMaybe(row.payload_json) || {} }));
  }

  static async ensureDefaultParticipants(sessionId, classId) {
    const sid = asInt(sessionId);
    const cid = asInt(classId);
    if (!sid || !cid) return;
    const providerMembers = await LearningProgramClass.listProviderMembers(cid);
    for (const p of providerMembers || []) {
      const role = (String(p.role_label || '').toLowerCase().includes('presenter')) ? 'presenter' : 'participant';
      await this.upsertParticipantRole({
        sessionId: sid,
        userId: p.provider_user_id,
        role,
        canUnmuteParticipants: role !== 'participant',
        canEnableParticipantVideo: role !== 'participant',
        canManageSlides: role !== 'participant',
        canManagePolls: role !== 'participant'
      });
    }
  }
}

export default LearningClassSession;
