import pool from '../config/database.js';

class AgencyBillingAccount {
  static async getByAgencyId(agencyId) {
    const aId = parseInt(agencyId, 10);
    const [rows] = await pool.execute(
      `SELECT * FROM agency_billing_accounts WHERE agency_id = ? LIMIT 1`,
      [aId]
    );
    return rows[0] || null;
  }

  static async upsertQboConnection({
    agencyId,
    billingEmail = null,
    realmId,
    accessTokenEnc,
    refreshTokenEnc,
    tokenExpiresAt
  }) {
    const aId = parseInt(agencyId, 10);
    await pool.execute(
      `INSERT INTO agency_billing_accounts
        (agency_id, billing_email, qbo_realm_id, qbo_access_token_enc, qbo_refresh_token_enc, qbo_token_expires_at, is_qbo_connected)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         billing_email = COALESCE(VALUES(billing_email), billing_email),
         qbo_realm_id = VALUES(qbo_realm_id),
         qbo_access_token_enc = VALUES(qbo_access_token_enc),
         qbo_refresh_token_enc = VALUES(qbo_refresh_token_enc),
         qbo_token_expires_at = VALUES(qbo_token_expires_at),
         is_qbo_connected = TRUE,
         updated_at = CURRENT_TIMESTAMP`,
      [
        aId,
        billingEmail,
        realmId,
        accessTokenEnc ? JSON.stringify(accessTokenEnc) : null,
        refreshTokenEnc ? JSON.stringify(refreshTokenEnc) : null,
        tokenExpiresAt || null
      ]
    );
    return this.getByAgencyId(aId);
  }

  static async disconnectQbo(agencyId) {
    const aId = parseInt(agencyId, 10);
    const [result] = await pool.execute(
      `UPDATE agency_billing_accounts
       SET is_qbo_connected = FALSE,
           qbo_realm_id = NULL,
           qbo_access_token_enc = NULL,
           qbo_refresh_token_enc = NULL,
           qbo_token_expires_at = NULL,
           qbo_vendor_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ?`,
      [aId]
    );
    return result.affectedRows > 0;
  }

  static async setQboVendorId(agencyId, vendorId) {
    const aId = parseInt(agencyId, 10);
    await pool.execute(
      `INSERT INTO agency_billing_accounts (agency_id, qbo_vendor_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE qbo_vendor_id = VALUES(qbo_vendor_id), updated_at = CURRENT_TIMESTAMP`,
      [aId, vendorId]
    );
    return this.getByAgencyId(aId);
  }

  static async updateBillingEmail(agencyId, billingEmail) {
    const aId = parseInt(agencyId, 10);
    await pool.execute(
      `INSERT INTO agency_billing_accounts (agency_id, billing_email)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE billing_email = VALUES(billing_email), updated_at = CURRENT_TIMESTAMP`,
      [aId, billingEmail]
    );
    return this.getByAgencyId(aId);
  }
}

export default AgencyBillingAccount;

