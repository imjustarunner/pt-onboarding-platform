import pool from '../config/database.js';

class HiringProfile {
  static async upsert({
    candidateUserId,
    stage = 'applied',
    appliedRole = null,
    source = null,
    jobDescriptionId = null,
    coverLetterText = null,
    referencesJson = null,
    referencesConsentJson = null,
    referencesConsentAt = null,
    jobAcknowledged = false,
    fluentLanguagesJson = null
  }) {
    // Backward compatibility: some DBs may not have newer hiring columns yet.
    try {
      await pool.execute(
        `INSERT INTO hiring_profiles (
          candidate_user_id, stage, applied_role, source, job_description_id, cover_letter_text, references_json,
          references_consent_json, references_consent_at, job_acknowledged, fluent_languages_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           stage = VALUES(stage),
           applied_role = VALUES(applied_role),
           source = VALUES(source),
           job_description_id = VALUES(job_description_id),
           cover_letter_text = VALUES(cover_letter_text),
           references_json = VALUES(references_json),
           references_consent_json = VALUES(references_consent_json),
           references_consent_at = VALUES(references_consent_at),
           job_acknowledged = VALUES(job_acknowledged),
           fluent_languages_json = VALUES(fluent_languages_json)`,
        [
          candidateUserId,
          stage,
          appliedRole,
          source,
          jobDescriptionId,
          coverLetterText,
          referencesJson ? JSON.stringify(referencesJson) : null,
          referencesConsentJson ? JSON.stringify(referencesConsentJson) : null,
          referencesConsentAt || null,
          jobAcknowledged ? 1 : 0,
          fluentLanguagesJson ? JSON.stringify(fluentLanguagesJson) : null
        ]
      );
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        try {
          await pool.execute(
            `INSERT INTO hiring_profiles (
              candidate_user_id, stage, applied_role, source, job_description_id, cover_letter_text, references_json, job_acknowledged, fluent_languages_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               stage = VALUES(stage),
               applied_role = VALUES(applied_role),
               source = VALUES(source),
               job_description_id = VALUES(job_description_id),
               cover_letter_text = VALUES(cover_letter_text),
               references_json = VALUES(references_json),
               job_acknowledged = VALUES(job_acknowledged),
               fluent_languages_json = VALUES(fluent_languages_json)`,
            [
              candidateUserId,
              stage,
              appliedRole,
              source,
              jobDescriptionId,
              coverLetterText,
              referencesJson ? JSON.stringify(referencesJson) : null,
              jobAcknowledged ? 1 : 0,
              fluentLanguagesJson ? JSON.stringify(fluentLanguagesJson) : null
            ]
          );
        } catch (e2) {
          if (e2?.code === 'ER_BAD_FIELD_ERROR') {
            await pool.execute(
              `INSERT INTO hiring_profiles (candidate_user_id, stage, applied_role, source)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 stage = VALUES(stage),
                 applied_role = VALUES(applied_role),
                 source = VALUES(source)`,
              [candidateUserId, stage, appliedRole, source]
            );
          } else {
            throw e2;
          }
        }
      } else {
        throw e;
      }
    }

    // For UPDATE, insertId may be 0; always fetch by candidate id.
    return this.findByCandidateUserId(candidateUserId);
  }

  static async findByCandidateUserId(candidateUserId) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM hiring_profiles
       WHERE candidate_user_id = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [candidateUserId]
    );
    return rows[0] || null;
  }
}

export default HiringProfile;

