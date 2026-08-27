import pool from '../config/database.js';
import {
  publicSubjectsFromAcademicKeys,
  publicGradesFromGradeKeys
} from '../constants/tutoringLearningOs.js';

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
    academic_subjects_json: parseJson(row.academic_subjects_json, []),
    emotional_behavioral_json: parseJson(row.emotional_behavioral_json, []),
    age_ranges_json: parseJson(row.age_ranges_json, []),
    grade_levels_json: parseJson(row.grade_levels_json, []),
    service_types_json: parseJson(row.service_types_json, []),
    assessment_tools_json: parseJson(row.assessment_tools_json, [])
  };
};

class StaffClientComfortPreference {
  static async findByUser(userId, agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM staff_client_comfort_preferences WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [userId, agencyId]
    );
    return normalize(rows[0] || null);
  }

  static async listByAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT p.*, u.first_name, u.last_name, u.email
       FROM staff_client_comfort_preferences p
       JOIN users u ON u.id = p.user_id
       WHERE p.agency_id = ?
       ORDER BY u.last_name, u.first_name`,
      [agencyId]
    );
    return rows.map(normalize);
  }

  static async upsert(payload, actorUserId) {
    const {
      agencyId,
      userId,
      hiringProfileId = null,
      academicSubjects = [],
      emotionalBehavioral = [],
      ageRanges = [],
      gradeLevels = [],
      serviceTypes = [],
      assessmentTools = [],
      additionalNotes = null
    } = payload;

    const existing = await this.findByUser(userId, agencyId);
    if (existing) {
      await pool.execute(
        `UPDATE staff_client_comfort_preferences SET
           hiring_profile_id = COALESCE(?, hiring_profile_id),
           academic_subjects_json = ?,
           emotional_behavioral_json = ?,
           age_ranges_json = ?,
           grade_levels_json = ?,
           service_types_json = ?,
           assessment_tools_json = ?,
           additional_notes = ?,
           completed_at = NOW(),
           updated_by_user_id = ?
         WHERE id = ?`,
        [
          hiringProfileId,
          JSON.stringify(academicSubjects || []),
          JSON.stringify(emotionalBehavioral || []),
          JSON.stringify(ageRanges || []),
          JSON.stringify(gradeLevels || []),
          JSON.stringify(serviceTypes || []),
          JSON.stringify(assessmentTools || []),
          additionalNotes,
          actorUserId || null,
          existing.id
        ]
      );
      const updated = await this.findByUser(userId, agencyId);
      await this.syncPublicTutoringProfile(updated);
      return updated;
    }

    const [result] = await pool.execute(
      `INSERT INTO staff_client_comfort_preferences
       (agency_id, user_id, hiring_profile_id, academic_subjects_json, emotional_behavioral_json,
        age_ranges_json, grade_levels_json, service_types_json, assessment_tools_json,
        additional_notes, completed_at, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        agencyId,
        userId,
        hiringProfileId,
        JSON.stringify(academicSubjects || []),
        JSON.stringify(emotionalBehavioral || []),
        JSON.stringify(ageRanges || []),
        JSON.stringify(gradeLevels || []),
        JSON.stringify(serviceTypes || []),
        JSON.stringify(assessmentTools || []),
        additionalNotes,
        actorUserId || null,
        actorUserId || null
      ]
    );
    const created = normalize(
      (
        await pool.execute(`SELECT * FROM staff_client_comfort_preferences WHERE id = ? LIMIT 1`, [
          result.insertId
        ])
      )[0][0]
    );
    await this.syncPublicTutoringProfile(created);
    return created;
  }

  /** Sync public-facing subject/grade subset into provider_tutoring_profiles. */
  static async syncPublicTutoringProfile(pref) {
    if (!pref?.user_id || !pref?.agency_id) return;
    const subjectAreas = publicSubjectsFromAcademicKeys(pref.academic_subjects_json || []);
    const gradeLevels = publicGradesFromGradeKeys(pref.grade_levels_json || []);
    await pool.execute(
      `INSERT INTO provider_tutoring_profiles
         (user_id, agency_id, subject_areas_json, grade_levels_json, accepting_new_students)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         subject_areas_json = VALUES(subject_areas_json),
         grade_levels_json = VALUES(grade_levels_json),
         updated_at = CURRENT_TIMESTAMP`,
      [pref.user_id, pref.agency_id, JSON.stringify(subjectAreas), JSON.stringify(gradeLevels)]
    );
  }

  static async saveHiringDraft(payload, actorUserId) {
    const {
      agencyId,
      hiringProfileId: hiringProfileIdIn = null,
      candidateUserId = null,
      academicSubjects = [],
      emotionalBehavioral = [],
      ageRanges = [],
      gradeLevels = [],
      serviceTypes = [],
      assessmentTools = [],
      additionalNotes = null
    } = payload;

    let hiringProfileId = hiringProfileIdIn;
    if (!hiringProfileId && candidateUserId) {
      const [hpRows] = await pool.execute(
        `SELECT id FROM hiring_profiles WHERE candidate_user_id = ? ORDER BY id DESC LIMIT 1`,
        [candidateUserId]
      );
      hiringProfileId = hpRows[0]?.id || null;
    }
    if (!hiringProfileId) {
      const err = new Error('hiringProfileId or candidateUserId with hiring profile required');
      err.status = 400;
      throw err;
    }

    await pool.execute(
      `INSERT INTO staff_comfort_preference_drafts
       (agency_id, hiring_profile_id, academic_subjects_json, emotional_behavioral_json,
        age_ranges_json, grade_levels_json, service_types_json, assessment_tools_json,
        additional_notes, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         academic_subjects_json = VALUES(academic_subjects_json),
         emotional_behavioral_json = VALUES(emotional_behavioral_json),
         age_ranges_json = VALUES(age_ranges_json),
         grade_levels_json = VALUES(grade_levels_json),
         service_types_json = VALUES(service_types_json),
         assessment_tools_json = VALUES(assessment_tools_json),
         additional_notes = VALUES(additional_notes),
         updated_by_user_id = VALUES(updated_by_user_id)`,
      [
        agencyId,
        hiringProfileId,
        JSON.stringify(academicSubjects || []),
        JSON.stringify(emotionalBehavioral || []),
        JSON.stringify(ageRanges || []),
        JSON.stringify(gradeLevels || []),
        JSON.stringify(serviceTypes || []),
        JSON.stringify(assessmentTools || []),
        additionalNotes,
        actorUserId || null,
        actorUserId || null
      ]
    );
    return this.findHiringDraft(hiringProfileId);
  }

  static async findHiringDraft(hiringProfileId) {
    const [rows] = await pool.execute(
      `SELECT * FROM staff_comfort_preference_drafts WHERE hiring_profile_id = ? LIMIT 1`,
      [hiringProfileId]
    );
    return normalize(rows[0] || null);
  }

  /** Promote hiring draft → user preference when candidate is hired. */
  static async promoteDraftToUser({ hiringProfileId, userId, agencyId }, actorUserId) {
    let draft = hiringProfileId ? await this.findHiringDraft(hiringProfileId) : null;
    if (!draft && userId) {
      const [rows] = await pool.execute(
        `SELECT d.*
         FROM staff_comfort_preference_drafts d
         JOIN hiring_profiles hp ON hp.id = d.hiring_profile_id
         WHERE hp.candidate_user_id = ?
         ORDER BY d.id DESC
         LIMIT 1`,
        [userId]
      );
      draft = normalize(rows[0] || null);
      if (draft) hiringProfileId = draft.hiring_profile_id;
    }
    if (!draft) return null;
    return this.upsert(
      {
        agencyId,
        userId,
        hiringProfileId,
        academicSubjects: draft.academic_subjects_json || [],
        emotionalBehavioral: draft.emotional_behavioral_json || [],
        ageRanges: draft.age_ranges_json || [],
        gradeLevels: draft.grade_levels_json || [],
        serviceTypes: draft.service_types_json || [],
        assessmentTools: draft.assessment_tools_json || [],
        additionalNotes: draft.additional_notes || null
      },
      actorUserId
    );
  }
}

export default StaffClientComfortPreference;
