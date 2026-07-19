import pool from '../config/database.js';

class AgencyClaimMdCredentials {
  static async upsert({ agencyId, accountId = null, accountKeyEnc, actorUserId = null }) {
    await pool.execute(
      `INSERT INTO agency_claimmd_credentials
         (agency_id, account_id, account_key_enc, is_active, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         account_id = VALUES(account_id),
         account_key_enc = VALUES(account_key_enc),
         is_active = 1,
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, accountId, accountKeyEnc, actorUserId, actorUserId]
    );
    return this.findByAgencyId(agencyId);
  }

  static async findByAgencyId(agencyId) {
    const [rows] = await pool.execute(
      `SELECT id, agency_id, account_id, account_key_enc, is_active, created_at, updated_at
       FROM agency_claimmd_credentials
       WHERE agency_id = ? AND is_active = 1
       LIMIT 1`,
      [agencyId]
    );
    return rows?.[0] || null;
  }

  static async publicMeta(agencyId) {
    const row = await this.findByAgencyId(agencyId);
    if (!row) return { configured: false };
    return {
      configured: true,
      accountId: row.account_id || null,
      updatedAt: row.updated_at || null
    };
  }
}

export default AgencyClaimMdCredentials;
