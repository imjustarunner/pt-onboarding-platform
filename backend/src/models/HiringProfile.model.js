import pool from '../config/database.js';

function jsonOrNull(value) {
  return value ? JSON.stringify(value) : null;
}

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
    fluentLanguagesJson = null,
    credential = null,
    licenseNumber = null,
    bestTimeToContact = null,
    interviewAvailability = null,
    independentlyCredentialed = null,
    groupPracticeInsurances = null,
    willingToSupervise = null
  }) {
    const fullParams = [
      candidateUserId,
      stage,
      appliedRole,
      source,
      jobDescriptionId,
      coverLetterText,
      jsonOrNull(referencesJson),
      jsonOrNull(referencesConsentJson),
      referencesConsentAt || null,
      jobAcknowledged ? 1 : 0,
      jsonOrNull(fluentLanguagesJson),
      credential ? String(credential).trim().slice(0, 255) : null,
      licenseNumber ? String(licenseNumber).trim().slice(0, 120) : null,
      bestTimeToContact ? String(bestTimeToContact).trim().slice(0, 255) : null,
      interviewAvailability ? String(interviewAvailability).trim().slice(0, 4000) : null,
      independentlyCredentialed === true || independentlyCredentialed === 1 || independentlyCredentialed === '1'
        ? 1
        : independentlyCredentialed === false || independentlyCredentialed === 0 || independentlyCredentialed === '0'
          ? 0
          : null,
      groupPracticeInsurances ? String(groupPracticeInsurances).trim().slice(0, 4000) : null,
      willingToSupervise === true || willingToSupervise === 1 || willingToSupervise === '1'
        ? 1
        : willingToSupervise === false || willingToSupervise === 0 || willingToSupervise === '0'
          ? 0
          : null
    ];

    try {
      await pool.execute(
        `INSERT INTO hiring_profiles (
          candidate_user_id, stage, applied_role, source, job_description_id, cover_letter_text, references_json,
          references_consent_json, references_consent_at, job_acknowledged, fluent_languages_json,
          credential, license_number, best_time_to_contact, interview_availability,
          independently_credentialed, group_practice_insurances, willing_to_supervise
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
           fluent_languages_json = VALUES(fluent_languages_json),
           credential = VALUES(credential),
           license_number = VALUES(license_number),
           best_time_to_contact = VALUES(best_time_to_contact),
           interview_availability = VALUES(interview_availability),
           independently_credentialed = VALUES(independently_credentialed),
           group_practice_insurances = VALUES(group_practice_insurances),
           willing_to_supervise = VALUES(willing_to_supervise)`,
        fullParams
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
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
          fullParams.slice(0, 11)
        );
      } catch (e2) {
        if (e2?.code === 'ER_BAD_FIELD_ERROR') {
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
                jsonOrNull(referencesJson),
                jobAcknowledged ? 1 : 0,
                jsonOrNull(fluentLanguagesJson)
              ]
            );
          } catch (e3) {
            if (e3?.code === 'ER_BAD_FIELD_ERROR') {
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
              throw e3;
            }
          }
        } else {
          throw e2;
        }
      }
    }

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
