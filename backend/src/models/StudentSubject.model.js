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
    metadata_json: parseJson(row.metadata_json, {}),
    reason_for_tutoring: row.reason_for_tutoring || null
  };
};

class StudentSubject {
  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId,
      subjectKey,
      subjectLabel,
      schoolGrade = null,
      instructionalLevel = null,
      reasonForTutoring = null,
      status = 'baseline_needed',
      primaryTutorUserId = null,
      standardsVersionKey = null,
      packageSubscriptionId = null,
      metadata = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO student_subjects
       (agency_id, client_id, subject_key, subject_label, school_grade, instructional_level,
        reason_for_tutoring, status, primary_tutor_user_id, standards_version_key,
        package_subscription_id, metadata_json, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        subjectKey,
        subjectLabel,
        schoolGrade,
        instructionalLevel,
        reasonForTutoring,
        status,
        primaryTutorUserId,
        standardsVersionKey,
        packageSubscriptionId,
        metadata ? JSON.stringify(metadata) : null,
        actorUserId || null,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM student_subjects WHERE id = ? LIMIT 1`, [id]);
    return normalize(rows[0] || null);
  }

  static async listByClient(clientId, { agencyId = null } = {}) {
    const params = [clientId];
    let sql = `SELECT * FROM student_subjects WHERE client_id = ?`;
    if (agencyId) {
      sql += ` AND agency_id = ?`;
      params.push(agencyId);
    }
    sql += ` ORDER BY FIELD(status,
      'active_tutoring','learning_plan_review','learning_plan_draft','baseline_in_progress','baseline_needed',
      'plan_review_due','reassessment','enrollment_started','goals_met','maintenance','completed','discharged'
    ), created_at DESC`;
    const [rows] = await pool.execute(sql, params);
    return rows.map(normalize);
  }

  static async update(id, payload, actorUserId) {
    const map = {
      subjectLabel: 'subject_label',
      schoolGrade: 'school_grade',
      instructionalLevel: 'instructional_level',
      reasonForTutoring: 'reason_for_tutoring',
      status: 'status',
      primaryTutorUserId: 'primary_tutor_user_id',
      standardsVersionKey: 'standards_version_key',
      packageSubscriptionId: 'package_subscription_id'
    };
    const updates = [];
    const values = [];
    Object.keys(map).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        updates.push(`${map[key]} = ?`);
        values.push(payload[key]);
      }
    });
    if (Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
      updates.push('metadata_json = ?');
      values.push(payload.metadata ? JSON.stringify(payload.metadata) : null);
    }
    if (payload.status === 'completed' || payload.status === 'discharged') {
      updates.push('completed_at = COALESCE(completed_at, NOW())');
    }
    if (!updates.length) return this.findById(id);
    updates.push('updated_by_user_id = ?');
    values.push(actorUserId || null);
    values.push(id);
    await pool.execute(`UPDATE student_subjects SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default StudentSubject;
