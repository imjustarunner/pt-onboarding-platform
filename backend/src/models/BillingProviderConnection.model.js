import pool from '../config/database.js';

function normalizeOwnerType(ownerType) {
  return String(ownerType || '').trim().toLowerCase() === 'platform' ? 'platform' : 'agency';
}

function normalizeProvider(provider) {
  return String(provider || 'QUICKBOOKS').trim().toUpperCase() || 'QUICKBOOKS';
}

class BillingProviderConnection {
  static async findById(id) {
    const connectionId = Number(id || 0);
    if (!connectionId) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM billing_provider_connections
       WHERE id = ?
       LIMIT 1`,
      [connectionId]
    );
    return rows?.[0] || null;
  }

  static async getByOwner({ ownerType = 'agency', ownerId = 0, provider = 'QUICKBOOKS' } = {}) {
    const normalizedOwnerType = normalizeOwnerType(ownerType);
    const normalizedOwnerId = Number(ownerId || 0);
    const normalizedProvider = normalizeProvider(provider);
    const [rows] = await pool.execute(
      `SELECT *
       FROM billing_provider_connections
       WHERE owner_type = ?
         AND owner_id = ?
         AND provider = ?
       LIMIT 1`,
      [normalizedOwnerType, normalizedOwnerId, normalizedProvider]
    );
    return rows?.[0] || null;
  }

  static async upsertQuickBooksConnection({
    ownerType = 'agency',
    ownerId = 0,
    realmId,
    accessTokenEnc,
    refreshTokenEnc,
    tokenExpiresAt,
    scopeCsv = null,
    qboPaymentsEnabled = false,
    qboPaymentsMerchantId = null,
    createdByUserId = null,
    updatedByUserId = null,
    metadataJson = undefined
  }) {
    const normalizedOwnerType = normalizeOwnerType(ownerType);
    const normalizedOwnerId = Number(ownerId || 0);
    await pool.execute(
      `INSERT INTO billing_provider_connections
        (owner_type, owner_id, provider, connection_label, is_connected,
         qbo_realm_id, qbo_access_token_enc, qbo_refresh_token_enc, qbo_token_expires_at,
         qbo_scope_csv, qbo_payments_enabled, qbo_payments_merchant_id, metadata_json,
         created_by_user_id, updated_by_user_id)
       VALUES (?, ?, 'QUICKBOOKS', ?, TRUE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         connection_label = VALUES(connection_label),
         is_connected = TRUE,
         qbo_realm_id = VALUES(qbo_realm_id),
         qbo_access_token_enc = VALUES(qbo_access_token_enc),
         qbo_refresh_token_enc = VALUES(qbo_refresh_token_enc),
         qbo_token_expires_at = VALUES(qbo_token_expires_at),
         qbo_scope_csv = VALUES(qbo_scope_csv),
         qbo_payments_enabled = VALUES(qbo_payments_enabled),
         qbo_payments_merchant_id = VALUES(qbo_payments_merchant_id),
         metadata_json = COALESCE(VALUES(metadata_json), metadata_json),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        normalizedOwnerType,
        normalizedOwnerId,
        normalizedOwnerType === 'platform' ? 'Platform QuickBooks' : `Agency ${normalizedOwnerId} QuickBooks`,
        String(realmId || '').trim() || null,
        accessTokenEnc ? JSON.stringify(accessTokenEnc) : null,
        refreshTokenEnc ? JSON.stringify(refreshTokenEnc) : null,
        tokenExpiresAt || null,
        scopeCsv || null,
        qboPaymentsEnabled ? 1 : 0,
        qboPaymentsMerchantId || null,
        metadataJson === undefined ? null : JSON.stringify(metadataJson),
        createdByUserId ? Number(createdByUserId) : null,
        updatedByUserId ? Number(updatedByUserId) : (createdByUserId ? Number(createdByUserId) : null)
      ]
    );
    return this.getByOwner({ ownerType: normalizedOwnerType, ownerId: normalizedOwnerId, provider: 'QUICKBOOKS' });
  }

  static async disconnect({ ownerType = 'agency', ownerId = 0, provider = 'QUICKBOOKS' } = {}) {
    const normalizedOwnerType = normalizeOwnerType(ownerType);
    const normalizedOwnerId = Number(ownerId || 0);
    const normalizedProvider = normalizeProvider(provider);
    const [result] = await pool.execute(
      `UPDATE billing_provider_connections
       SET is_connected = FALSE,
           qbo_realm_id = NULL,
           qbo_access_token_enc = NULL,
           qbo_refresh_token_enc = NULL,
           qbo_token_expires_at = NULL,
           qbo_scope_csv = NULL,
           qbo_payments_enabled = FALSE,
           qbo_payments_merchant_id = NULL,
           qbo_default_service_item_id = NULL,
           qbo_default_income_account_id = NULL,
           qbo_default_deposit_account_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE owner_type = ?
         AND owner_id = ?
         AND provider = ?`,
      [normalizedOwnerType, normalizedOwnerId, normalizedProvider]
    );
    return result.affectedRows > 0;
  }

  static async setQuickBooksCapability(connectionId, {
    qboPaymentsEnabled = false,
    qboPaymentsMerchantId = null,
    scopeCsv = undefined,
    defaultServiceItemId = undefined,
    defaultIncomeAccountId = undefined,
    defaultDepositAccountId = undefined
  } = {}) {
    const cid = Number(connectionId || 0);
    if (!cid) throw new Error('Invalid connectionId');
    const fields = ['qbo_payments_enabled = ?', 'qbo_payments_merchant_id = ?'];
    const values = [qboPaymentsEnabled ? 1 : 0, qboPaymentsMerchantId || null];
    if (scopeCsv !== undefined) {
      fields.push('qbo_scope_csv = ?');
      values.push(scopeCsv || null);
    }
    if (defaultServiceItemId !== undefined) {
      fields.push('qbo_default_service_item_id = ?');
      values.push(defaultServiceItemId || null);
    }
    if (defaultIncomeAccountId !== undefined) {
      fields.push('qbo_default_income_account_id = ?');
      values.push(defaultIncomeAccountId || null);
    }
    if (defaultDepositAccountId !== undefined) {
      fields.push('qbo_default_deposit_account_id = ?');
      values.push(defaultDepositAccountId || null);
    }
    values.push(cid);
    await pool.execute(
      `UPDATE billing_provider_connections
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      values
    );
    return this.findById(cid);
  }
}

export default BillingProviderConnection;
