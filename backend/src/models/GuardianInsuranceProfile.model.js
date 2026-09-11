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
    const gid = Number(guardianUserId || 0);
    const aid = Number(agencyId || 0);
    const cid = clientId != null ? Number(clientId) : null;
    if (!gid || !aid) return null;

    const params = {
      primary_insurer_name: primary.insurerName || null,
      primary_member_id: primary.memberId || null,
      primary_group_number: primary.groupNumber || null,
      primary_subscriber_name: primary.subscriberName || null,
      primary_is_medicaid: primary.isMedicaid ? 1 : 0,
      primary_card_front_url: primaryCardFrontUrl,
      primary_card_back_url: primaryCardBackUrl,
      secondary_insurer_name: secondary?.insurerName || null,
      secondary_member_id: secondary?.memberId || null,
      secondary_group_number: secondary?.groupNumber || null,
      secondary_subscriber_name: secondary?.subscriberName || null,
      secondary_is_medicaid: secondary?.isMedicaid ? 1 : 0,
      secondary_card_front_url: secondaryCardFrontUrl,
      secondary_card_back_url: secondaryCardBackUrl,
      intake_submission_id: intakeSubmissionId || null
    };

    // Prefer update of the latest row for this guardian + agency (+ client when set).
    let existingId = null;
    if (cid) {
      const [rows] = await pool.query(
        `SELECT id FROM guardian_insurance_profiles
          WHERE guardian_user_id = ? AND agency_id = ? AND client_id = ?
          ORDER BY updated_at DESC, id DESC
          LIMIT 1`,
        [gid, aid, cid]
      );
      existingId = rows?.[0]?.id || null;
    }
    if (!existingId) {
      const [rows] = await pool.query(
        `SELECT id FROM guardian_insurance_profiles
          WHERE guardian_user_id = ? AND agency_id = ?
            AND (client_id IS NULL OR client_id = ?)
          ORDER BY (client_id IS NOT NULL) DESC, updated_at DESC, id DESC
          LIMIT 1`,
        [gid, aid, cid]
      );
      existingId = rows?.[0]?.id || null;
    }

    if (existingId) {
      await pool.query(
        `UPDATE guardian_insurance_profiles SET
           client_id = COALESCE(?, client_id),
           intake_submission_id = COALESCE(?, intake_submission_id),
           primary_insurer_name = ?,
           primary_member_id = ?,
           primary_group_number = ?,
           primary_subscriber_name = ?,
           primary_is_medicaid = ?,
           primary_card_front_url = COALESCE(?, primary_card_front_url),
           primary_card_back_url = COALESCE(?, primary_card_back_url),
           secondary_insurer_name = ?,
           secondary_member_id = ?,
           secondary_group_number = ?,
           secondary_subscriber_name = ?,
           secondary_is_medicaid = ?,
           secondary_card_front_url = COALESCE(?, secondary_card_front_url),
           secondary_card_back_url = COALESCE(?, secondary_card_back_url),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          cid,
          params.intake_submission_id,
          params.primary_insurer_name,
          params.primary_member_id,
          params.primary_group_number,
          params.primary_subscriber_name,
          params.primary_is_medicaid,
          params.primary_card_front_url,
          params.primary_card_back_url,
          params.secondary_insurer_name,
          params.secondary_member_id,
          params.secondary_group_number,
          params.secondary_subscriber_name,
          params.secondary_is_medicaid,
          params.secondary_card_front_url,
          params.secondary_card_back_url,
          existingId
        ]
      );
      return existingId;
    }

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
               ?, ?)`,
      [
        gid, cid, aid, params.intake_submission_id,
        params.primary_insurer_name, params.primary_member_id, params.primary_group_number,
        params.primary_subscriber_name, params.primary_is_medicaid,
        params.primary_card_front_url, params.primary_card_back_url,
        params.secondary_insurer_name, params.secondary_member_id, params.secondary_group_number,
        params.secondary_subscriber_name, params.secondary_is_medicaid,
        params.secondary_card_front_url, params.secondary_card_back_url
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
