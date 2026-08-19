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

class HiringInterviewArtifact {
  static hydrate(row) {
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id),
      hiring_interview_id: Number(row.hiring_interview_id),
      flow_state_json: parseJsonMaybe(row.flow_state_json, null),
      scorecard_json: parseJsonMaybe(row.scorecard_json, null),
      private_notes_json: parseJsonMaybe(row.private_notes_json, null),
      team_chat_json: parseJsonMaybe(row.team_chat_json, null),
      action_items_json: parseJsonMaybe(row.action_items_json, []),
      average_score: row.average_score != null ? Number(row.average_score) : null
    };
  }

  static async findByInterviewId(hiringInterviewId) {
    const [rows] = await pool.execute(
      `SELECT * FROM hiring_interview_artifacts WHERE hiring_interview_id = ? LIMIT 1`,
      [parseIntParam(hiringInterviewId)]
    );
    return this.hydrate(rows[0] || null);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM hiring_interview_artifacts WHERE id = ? LIMIT 1`,
      [parseIntParam(id)]
    );
    return this.hydrate(rows[0] || null);
  }

  static async upsertByInterviewId(hiringInterviewId, patch = {}) {
    const existing = await this.findByInterviewId(hiringInterviewId);
    if (!existing) {
      const [result] = await pool.execute(
        `INSERT INTO hiring_interview_artifacts (
          hiring_interview_id, flow_state_json, scorecard_json, private_notes_json,
          team_chat_json, transcript_summary, action_items_json, average_score, finalized_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parseIntParam(hiringInterviewId),
          toJsonParam(patch.flowStateJson ?? null),
          toJsonParam(patch.scorecardJson ?? null),
          toJsonParam(patch.privateNotesJson ?? null),
          toJsonParam(patch.teamChatJson ?? null),
          patch.transcriptSummary != null ? String(patch.transcriptSummary) : null,
          toJsonParam(patch.actionItemsJson ?? null),
          patch.averageScore != null ? Number(patch.averageScore) : null,
          toSqlDatetime(patch.finalizedAt)
        ]
      );
      return this.findById(result.insertId);
    }

    const updates = [];
    const params = [];

    if (patch.flowStateJson !== undefined) {
      updates.push('flow_state_json = ?');
      params.push(toJsonParam(patch.flowStateJson));
    }
    if (patch.scorecardJson !== undefined) {
      updates.push('scorecard_json = ?');
      params.push(toJsonParam(patch.scorecardJson));
    }
    if (patch.privateNotesJson !== undefined) {
      updates.push('private_notes_json = ?');
      params.push(toJsonParam(patch.privateNotesJson));
    }
    if (patch.teamChatJson !== undefined) {
      updates.push('team_chat_json = ?');
      params.push(toJsonParam(patch.teamChatJson));
    }
    if (patch.transcriptSummary !== undefined) {
      updates.push('transcript_summary = ?');
      params.push(patch.transcriptSummary != null ? String(patch.transcriptSummary) : null);
    }
    if (patch.actionItemsJson !== undefined) {
      updates.push('action_items_json = ?');
      params.push(toJsonParam(patch.actionItemsJson));
    }
    if (patch.averageScore !== undefined) {
      updates.push('average_score = ?');
      params.push(patch.averageScore != null ? Number(patch.averageScore) : null);
    }
    if (patch.finalizedAt !== undefined) {
      updates.push('finalized_at = ?');
      params.push(toSqlDatetime(patch.finalizedAt));
    }

    if (!updates.length) return existing;

    params.push(existing.id);
    await pool.execute(
      `UPDATE hiring_interview_artifacts SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return this.findByInterviewId(hiringInterviewId);
  }
}

export default HiringInterviewArtifact;
