import pool from '../config/database.js';

export default class GuardianInsuranceProfile {
  static async upsert({
    guardianUserId,
    clientId = null,
    agencyId,
    intakeSubmissionId = null,
    primary = {},
    secondary = null,
    primaryCardFrontUrl = null,
    primaryCardBackUrl = null,
    secondaryCardFrontUrl = null,
    secondaryCardBackUrl = null
  }) {
    const [rows] = await pool.query(
      `INSERT INTO guardian_insurance_profiles
        (guardian_user_id, client_id, agency_id, intake_submission_id,
         primary_insurer_name, primary_member_id, primary_group_number, primary_subscriber_name, primary_is_medicaid,
         primary_card_front_url, primary_card_back_url,
         secondary_insurer_name, secondary_member_id, secondary_group_number, secondary_subscriber_name, secondary_is_medicaid,
         secondary_card_front_url, secondary_card_back_url)
       VALUES (?, ?, ?, ?,
               ?, ?, ?, ?, ?,
               ?, ?,
               ?, ?, ?, ?, ?,
               ?, ?)
       ON DUPLICATE KEY UPDATE
         primary_insurer_name      = VALUES(primary_insurer_name),
         primary_member_id         = VALUES(primary_member_id),
         primary_group_number      = VALUES(primary_group_number),
         primary_subscriber_name   = VALUES(primary_subscriber_name),
         primary_is_medicaid       = VALUES(primary_is_medicaid),
         primary_card_front_url    = COALESCE(VALUES(primary_card_front_url), primary_card_front_url),
         primary_card_back_url     = COALESCE(VALUES(primary_card_back_url), primary_card_back_url),
         secondary_insurer_name    = VALUES(secondary_insurer_name),
         secondary_member_id       = VALUES(secondary_member_id),
         secondary_group_number    = VALUES(secondary_group_number),
         secondary_subscriber_name = VALUES(secondary_subscriber_name),
         secondary_is_medicaid     = VALUES(secondary_is_medicaid),
         secondary_card_front_url  = COALESCE(VALUES(secondary_card_front_url), secondary_card_front_url),
         secondary_card_back_url   = COALESCE(VALUES(secondary_card_back_url), secondary_card_back_url),
         updated_at                = CURRENT_TIMESTAMP`,
      [
        guardianUserId, clientId || null, agencyId, intakeSubmissionId || null,
        primary.insurerName || null, primary.memberId || null, primary.groupNumber || null,
        primary.subscriberName || null, primary.isMedicaid ? 1 : 0,
        primaryCardFrontUrl, primaryCardBackUrl,
        secondary?.insurerName || null, secondary?.memberId || null, secondary?.groupNumber || null,
        secondary?.subscriberName || null, secondary?.isMedicaid ? 1 : 0,
        secondaryCardFrontUrl, secondaryCardBackUrl
      ]
    );
    return rows.insertId || null;
  }

  static async updateCardUrls(guardianUserId, agencyId, urls = {}) {
    const sets = [];
    const vals = [];
    if (urls.primaryCardFrontUrl !== undefined) { sets.push('primary_card_front_url = ?'); vals.push(urls.primaryCardFrontUrl); }
    if (urls.primaryCardBackUrl !== undefined) { sets.push('primary_card_back_url = ?'); vals.push(urls.primaryCardBackUrl); }
    if (urls.secondaryCardFrontUrl !== undefined) { sets.push('secondary_card_front_url = ?'); vals.push(urls.secondaryCardFrontUrl); }
    if (urls.secondaryCardBackUrl !== undefined) { sets.push('secondary_card_back_url = ?'); vals.push(urls.secondaryCardBackUrl); }
    if (!sets.length) return;
    vals.push(guardianUserId, agencyId);
    await pool.query(
      `UPDATE guardian_insurance_profiles SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE guardian_user_id = ? AND agency_id = ?
       ORDER BY collected_at DESC LIMIT 1`,
      vals
    );
  }

  static async findByGuardian(guardianUserId, agencyId) {
    const [rows] = await pool.query(
      'SELECT * FROM guardian_insurance_profiles WHERE guardian_user_id = ? AND agency_id = ? ORDER BY collected_at DESC',
      [guardianUserId, agencyId]
    );
    return rows;
  }
}
