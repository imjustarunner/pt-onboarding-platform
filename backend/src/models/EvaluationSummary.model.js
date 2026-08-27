import pool from '../config/database.js';

const parseJson = (value, fallback = null) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalize = (row) => {
  if (!row) return null;
  return {
    ...row,
    strengths_json: parseJson(row.strengths_json, []),
    needs_json: parseJson(row.needs_json, []),
    skill_map_json: parseJson(row.skill_map_json, {}),
    metadata_json: parseJson(row.metadata_json, {})
  };
};

class EvaluationSummary {
  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId,
      studentSubjectId,
      evaluationPath = 'manual_baseline',
      evaluationType = 'baseline',
      administeredAt = null,
      administeredByUserId = null,
      gradeAtEval = null,
      strengths = [],
      needs = [],
      skillMap = {},
      narrativeSummary = null,
      externalSourceLabel = null,
      status = 'draft',
      metadata = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO evaluation_summaries
       (agency_id, client_id, student_subject_id, evaluation_path, evaluation_type,
        administered_at, administered_by_user_id, grade_at_eval, strengths_json, needs_json,
        skill_map_json, narrative_summary, external_source_label, status, metadata_json,
        created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        evaluationPath,
        evaluationType,
        administeredAt,
        administeredByUserId || actorUserId || null,
        gradeAtEval,
        JSON.stringify(strengths || []),
        JSON.stringify(needs || []),
        JSON.stringify(skillMap || {}),
        narrativeSummary,
        externalSourceLabel,
        status,
        metadata ? JSON.stringify(metadata) : null,
        actorUserId || null,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM evaluation_summaries WHERE id = ? LIMIT 1`, [id]);
    return normalize(rows[0] || null);
  }

  static async listBySubject(studentSubjectId) {
    const [rows] = await pool.execute(
      `SELECT * FROM evaluation_summaries WHERE student_subject_id = ? ORDER BY created_at DESC`,
      [studentSubjectId]
    );
    return rows.map(normalize);
  }

  static async update(id, payload, actorUserId) {
    const map = {
      evaluationPath: 'evaluation_path',
      evaluationType: 'evaluation_type',
      administeredAt: 'administered_at',
      administeredByUserId: 'administered_by_user_id',
      gradeAtEval: 'grade_at_eval',
      narrativeSummary: 'narrative_summary',
      externalSourceLabel: 'external_source_label',
      status: 'status'
    };
    const updates = [];
    const values = [];
    Object.keys(map).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        updates.push(`${map[key]} = ?`);
        values.push(payload[key]);
      }
    });
    if (Object.prototype.hasOwnProperty.call(payload, 'strengths')) {
      updates.push('strengths_json = ?');
      values.push(JSON.stringify(payload.strengths || []));
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'needs')) {
      updates.push('needs_json = ?');
      values.push(JSON.stringify(payload.needs || []));
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'skillMap')) {
      updates.push('skill_map_json = ?');
      values.push(JSON.stringify(payload.skillMap || {}));
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
      updates.push('metadata_json = ?');
      values.push(payload.metadata ? JSON.stringify(payload.metadata) : null);
    }
    if (!updates.length) return this.findById(id);
    updates.push('updated_by_user_id = ?');
    values.push(actorUserId || null);
    values.push(id);
    await pool.execute(`UPDATE evaluation_summaries SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default EvaluationSummary;
