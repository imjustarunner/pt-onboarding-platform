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

class AcademicSkillEvidence {
  static normalize(row) {
    if (!row) return null;
    return { ...row, metadata_json: parseJson(row.metadata_json, {}) };
  }

  static async create(payload) {
    const {
      agencyId,
      clientId,
      studentSubjectId,
      learningPlanId = null,
      planGoalId = null,
      learningEvidenceId = null,
      sessionId = null,
      sessionNoteId = null,
      evidenceType = 'session_observation',
      skillKey = null,
      skillLabel = null,
      rating = null,
      scoreValue = null,
      notes = null,
      observedAt = null,
      recordedByUserId = null,
      metadata = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO academic_skill_evidence
       (agency_id, client_id, student_subject_id, learning_plan_id, plan_goal_id, learning_evidence_id,
        session_id, session_note_id, evidence_type, skill_key, skill_label, rating, score_value,
        notes, observed_at, recorded_by_user_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        learningPlanId,
        planGoalId,
        learningEvidenceId,
        sessionId,
        sessionNoteId,
        evidenceType,
        skillKey,
        skillLabel,
        rating,
        scoreValue,
        notes,
        observedAt,
        recordedByUserId,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM academic_skill_evidence WHERE id = ? LIMIT 1`, [id]);
    return this.normalize(rows[0] || null);
  }

  static async listBySubject(studentSubjectId, { limit = 100 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const [rows] = await pool.execute(
      `SELECT * FROM academic_skill_evidence WHERE student_subject_id = ? ORDER BY observed_at DESC, id DESC LIMIT ${lim}`,
      [studentSubjectId]
    );
    return rows.map((r) => this.normalize(r));
  }

  static async listByGoal(planGoalId, { limit = 50 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const [rows] = await pool.execute(
      `SELECT * FROM academic_skill_evidence
       WHERE plan_goal_id = ?
       ORDER BY observed_at DESC, id DESC
       LIMIT ${lim}`,
      [planGoalId]
    );
    return rows.map((r) => this.normalize(r));
  }

  static async progressChart(studentSubjectId) {
    const [rows] = await pool.execute(
      `SELECT DATE(observed_at) AS day, rating, COUNT(*) AS cnt
       FROM academic_skill_evidence
       WHERE student_subject_id = ?
       GROUP BY DATE(observed_at), rating
       ORDER BY day ASC`,
      [studentSubjectId]
    );
    return rows;
  }
}

class TutoringSessionBrief {
  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      focus_goal_ids_json: parseJson(row.focus_goal_ids_json, []),
      planned_activities_json: parseJson(row.planned_activities_json, []),
      materials_json: parseJson(row.materials_json, []),
      guide_json: parseJson(row.guide_json, {})
    };
  }

  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId,
      studentSubjectId,
      learningPlanId = null,
      sessionId = null,
      focusGoalIds = [],
      plannedActivities = [],
      materials = [],
      guide = null,
      priorSessionRecap = null,
      tutorPrepNotes = null,
      status = 'draft',
      generatedBy = 'system',
      aiArtifactId = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO tutoring_session_briefs
       (agency_id, client_id, student_subject_id, learning_plan_id, session_id,
        focus_goal_ids_json, planned_activities_json, materials_json, guide_json, prior_session_recap,
        tutor_prep_notes, status, generated_by, ai_artifact_id, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        learningPlanId,
        sessionId,
        JSON.stringify(focusGoalIds || []),
        JSON.stringify(plannedActivities || []),
        JSON.stringify(materials || []),
        guide ? JSON.stringify(guide) : null,
        priorSessionRecap,
        tutorPrepNotes,
        status,
        generatedBy,
        aiArtifactId,
        actorUserId || null,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM tutoring_session_briefs WHERE id = ? LIMIT 1`, [id]);
    return this.normalize(rows[0] || null);
  }

  static async findBySession(sessionId) {
    const [rows] = await pool.execute(
      `SELECT * FROM tutoring_session_briefs WHERE session_id = ? ORDER BY id DESC LIMIT 1`,
      [sessionId]
    );
    return this.normalize(rows[0] || null);
  }

  static async update(id, payload, actorUserId) {
    const map = {
      learningPlanId: 'learning_plan_id',
      sessionId: 'session_id',
      priorSessionRecap: 'prior_session_recap',
      tutorPrepNotes: 'tutor_prep_notes',
      status: 'status',
      generatedBy: 'generated_by',
      aiArtifactId: 'ai_artifact_id'
    };
    const updates = [];
    const values = [];
    Object.keys(map).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        updates.push(`${map[key]} = ?`);
        values.push(payload[key]);
      }
    });
    for (const [key, col] of [
      ['focusGoalIds', 'focus_goal_ids_json'],
      ['plannedActivities', 'planned_activities_json'],
      ['materials', 'materials_json'],
      ['guide', 'guide_json']
    ]) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        updates.push(`${col} = ?`);
        values.push(JSON.stringify(payload[key] || (key === 'guide' ? {} : [])));
      }
    }
    if (!updates.length) return this.findById(id);
    updates.push('updated_by_user_id = ?');
    values.push(actorUserId || null);
    values.push(id);
    await pool.execute(`UPDATE tutoring_session_briefs SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

class TutoringSessionNote {
  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      how_it_went_json: parseJson(row.how_it_went_json, {}),
      evidence_chips_json: parseJson(row.evidence_chips_json, []),
      metadata_json: parseJson(row.metadata_json, {})
    };
  }

  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId,
      studentSubjectId,
      learningPlanId = null,
      sessionId = null,
      sessionBriefId = null,
      attendanceStatus = null,
      sessionType = null,
      howItWent = {},
      evidenceChips = [],
      strengthsObserved = null,
      challengesObserved = null,
      summary = null,
      nextSteps = null,
      homework = null,
      generalSupport = false,
      parentUpdateDraft = null,
      status = 'draft',
      metadata = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO tutoring_session_notes
       (agency_id, client_id, student_subject_id, learning_plan_id, session_id, session_brief_id,
        attendance_status, session_type, how_it_went_json, evidence_chips_json, strengths_observed,
        challenges_observed, summary, next_steps, homework, general_support, parent_update_draft,
        status, metadata_json, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        learningPlanId,
        sessionId,
        sessionBriefId,
        attendanceStatus,
        sessionType,
        JSON.stringify(howItWent || {}),
        JSON.stringify(evidenceChips || []),
        strengthsObserved,
        challengesObserved,
        summary,
        nextSteps,
        homework,
        generalSupport ? 1 : 0,
        parentUpdateDraft,
        status,
        metadata ? JSON.stringify(metadata) : null,
        actorUserId || null,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM tutoring_session_notes WHERE id = ? LIMIT 1`, [id]);
    return this.normalize(rows[0] || null);
  }

  static async findBySession(sessionId) {
    const [rows] = await pool.execute(
      `SELECT * FROM tutoring_session_notes WHERE session_id = ? ORDER BY id DESC LIMIT 1`,
      [sessionId]
    );
    return this.normalize(rows[0] || null);
  }

  static async listBySubject(studentSubjectId, { limit = 50 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const [rows] = await pool.execute(
      `SELECT * FROM tutoring_session_notes WHERE student_subject_id = ? ORDER BY created_at DESC LIMIT ${lim}`,
      [studentSubjectId]
    );
    return rows.map((r) => this.normalize(r));
  }

  static async update(id, payload, actorUserId) {
    const map = {
      learningPlanId: 'learning_plan_id',
      sessionId: 'session_id',
      sessionBriefId: 'session_brief_id',
      attendanceStatus: 'attendance_status',
      sessionType: 'session_type',
      strengthsObserved: 'strengths_observed',
      challengesObserved: 'challenges_observed',
      summary: 'summary',
      nextSteps: 'next_steps',
      homework: 'homework',
      parentUpdateDraft: 'parent_update_draft',
      status: 'status',
      aiArtifactId: 'ai_artifact_id'
    };
    const updates = [];
    const values = [];
    Object.keys(map).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        updates.push(`${map[key]} = ?`);
        values.push(payload[key]);
      }
    });
    if (Object.prototype.hasOwnProperty.call(payload, 'howItWent')) {
      updates.push('how_it_went_json = ?');
      values.push(JSON.stringify(payload.howItWent || {}));
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'evidenceChips')) {
      updates.push('evidence_chips_json = ?');
      values.push(JSON.stringify(payload.evidenceChips || []));
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'generalSupport')) {
      updates.push('general_support = ?');
      values.push(payload.generalSupport ? 1 : 0);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
      updates.push('metadata_json = ?');
      values.push(payload.metadata ? JSON.stringify(payload.metadata) : null);
    }
    if (payload.status === 'saved' || payload.status === 'progress_updated') {
      updates.push('saved_at = COALESCE(saved_at, NOW())');
      updates.push('saved_by_user_id = ?');
      values.push(actorUserId || null);
    }
    if (!updates.length) return this.findById(id);
    updates.push('updated_by_user_id = ?');
    values.push(actorUserId || null);
    values.push(id);
    await pool.execute(`UPDATE tutoring_session_notes SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export { AcademicSkillEvidence, TutoringSessionBrief, TutoringSessionNote };
