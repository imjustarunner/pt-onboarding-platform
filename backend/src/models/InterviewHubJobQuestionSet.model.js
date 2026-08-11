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

class InterviewHubJobQuestionSet {
  static hydrate(row) {
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id),
      agency_id: Number(row.agency_id),
      job_description_id: row.job_description_id != null ? Number(row.job_description_id) : null,
      is_active: Number(row.is_active) === 1,
      questions_json: parseJsonMaybe(row.questions_json, [])
    };
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM interview_hub_job_question_sets WHERE id = ? LIMIT 1`,
      [parseIntParam(id)]
    );
    return this.hydrate(rows[0] || null);
  }

  static async listByAgencyId(agencyId, { jobDescriptionId = null, includeInactive = false, limit = 200 } = {}) {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
    const clauses = ['agency_id = ?'];
    const params = [parseIntParam(agencyId)];
    if (jobDescriptionId != null) {
      clauses.push('job_description_id = ?');
      params.push(parseIntParam(jobDescriptionId));
    }
    if (!includeInactive) {
      clauses.push('is_active = 1');
    }
    const [rows] = await pool.execute(
      `SELECT * FROM interview_hub_job_question_sets
       WHERE ${clauses.join(' AND ')}
       ORDER BY updated_at DESC, id DESC
       LIMIT ${lim}`,
      params
    );
    return (rows || []).map((r) => this.hydrate(r));
  }

  static async create({
    agencyId,
    jobDescriptionId = null,
    title,
    questionsJson,
    isActive = true,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO interview_hub_job_question_sets (
        agency_id, job_description_id, title, questions_json, is_active, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        parseIntParam(agencyId),
        jobDescriptionId != null ? parseIntParam(jobDescriptionId) : null,
        String(title || '').trim().slice(0, 255),
        toJsonParam(questionsJson ?? []),
        isActive ? 1 : 0,
        parseIntParam(createdByUserId)
      ]
    );
    return this.findById(result.insertId);
  }

  static async updateById(id, patch = {}) {
    const updates = [];
    const params = [];

    if (patch.jobDescriptionId !== undefined) {
      updates.push('job_description_id = ?');
      params.push(patch.jobDescriptionId != null ? parseIntParam(patch.jobDescriptionId) : null);
    }
    if (patch.title !== undefined) {
      updates.push('title = ?');
      params.push(String(patch.title || '').trim().slice(0, 255));
    }
    if (patch.questionsJson !== undefined) {
      updates.push('questions_json = ?');
      params.push(toJsonParam(patch.questionsJson));
    }
    if (patch.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(patch.isActive ? 1 : 0);
    }

    if (!updates.length) return this.findById(id);

    params.push(parseIntParam(id));
    await pool.execute(
      `UPDATE interview_hub_job_question_sets SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return this.findById(id);
  }

  static async deleteById(id) {
    const [result] = await pool.execute(
      `DELETE FROM interview_hub_job_question_sets WHERE id = ?`,
      [parseIntParam(id)]
    );
    return (result?.affectedRows || 0) > 0;
  }
}

export default InterviewHubJobQuestionSet;
