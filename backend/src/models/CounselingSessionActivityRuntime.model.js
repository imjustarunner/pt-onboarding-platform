import pool from '../config/database.js';
import { parseJson } from './CounselingSession.model.js';

const STATUSES = new Set([
  'INACTIVE',
  'PREVIEW',
  'CLIENT_PROMPT',
  'LOADING',
  'ACTIVE',
  'PAUSED',
  'REFLECTING',
  'COMPLETED',
  'RETURNING',
  'ERROR_RECOVERY'
]);

export default class CounselingSessionActivityRuntime {
  static async findBySession(sessionId) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_session_activity_runtime
       WHERE session_id = ?
       ORDER BY updated_at DESC`,
      [Number(sessionId)]
    );
    return rows.map((r) => this.toPublic(r));
  }

  static async findActiveForSession(sessionId) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_session_activity_runtime
       WHERE session_id = ?
         AND status NOT IN ('INACTIVE', 'COMPLETED', 'RETURNING')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [Number(sessionId)]
    );
    return rows[0] ? this.toPublic(rows[0]) : null;
  }

  static async findBySessionAndActivity(sessionId, activityId) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_session_activity_runtime
       WHERE session_id = ? AND activity_id = ?
       LIMIT 1`,
      [Number(sessionId), String(activityId)]
    );
    return rows[0] ? this.toPublic(rows[0]) : null;
  }

  static async upsert({
    sessionId,
    activityId,
    status,
    roundNumber = 0,
    sharedState = null,
    checkpoint = null,
    pauseReason = null,
    invitedByUserId = null,
    startedAt = null,
    completedAt = null
  }) {
    const existing = await this.findBySessionAndActivity(sessionId, activityId);
    if (existing) {
      return this.update(existing.id, {
        status,
        roundNumber,
        sharedState,
        checkpoint,
        pauseReason,
        startedAt,
        completedAt
      });
    }
    const [result] = await pool.execute(
      `INSERT INTO counseling_session_activity_runtime
        (session_id, activity_id, status, round_number, shared_state_json,
         checkpoint_json, pause_reason, invited_by_user_id, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(sessionId),
        String(activityId),
        STATUSES.has(status) ? status : 'INACTIVE',
        Number(roundNumber) || 0,
        sharedState != null ? JSON.stringify(sharedState) : null,
        checkpoint != null ? JSON.stringify(checkpoint) : null,
        pauseReason || null,
        invitedByUserId != null ? Number(invitedByUserId) : null,
        startedAt || null,
        completedAt || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM counseling_session_activity_runtime WHERE id = ? LIMIT 1`,
      [Number(id)]
    );
    return rows[0] ? this.toPublic(rows[0]) : null;
  }

  static async update(id, fields = {}) {
    const sets = [];
    const params = [];
    if (fields.status !== undefined && STATUSES.has(fields.status)) {
      sets.push('status = ?');
      params.push(fields.status);
    }
    if (fields.roundNumber !== undefined) {
      sets.push('round_number = ?');
      params.push(Number(fields.roundNumber) || 0);
    }
    if (fields.sharedState !== undefined) {
      sets.push('shared_state_json = ?');
      params.push(fields.sharedState != null ? JSON.stringify(fields.sharedState) : null);
    }
    if (fields.checkpoint !== undefined) {
      sets.push('checkpoint_json = ?');
      params.push(fields.checkpoint != null ? JSON.stringify(fields.checkpoint) : null);
    }
    if (fields.pauseReason !== undefined) {
      sets.push('pause_reason = ?');
      params.push(fields.pauseReason);
    }
    if (fields.startedAt !== undefined) {
      sets.push('started_at = ?');
      params.push(fields.startedAt);
    }
    if (fields.completedAt !== undefined) {
      sets.push('completed_at = ?');
      params.push(fields.completedAt);
    }
    if (!sets.length) return this.findById(id);
    params.push(Number(id));
    await pool.execute(
      `UPDATE counseling_session_activity_runtime
       SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      params
    );
    return this.findById(id);
  }

  static toPublic(row) {
    if (!row) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      activityId: row.activity_id,
      status: row.status,
      roundNumber: row.round_number,
      sharedState: parseJson(row.shared_state_json, {}),
      checkpoint: parseJson(row.checkpoint_json, null),
      pauseReason: row.pause_reason,
      invitedByUserId: row.invited_by_user_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
      createdAt: row.created_at
    };
  }
}
