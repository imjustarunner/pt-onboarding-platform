import pool from '../config/database.js';

class AgencyBillingAccount {
  static async getByAgencyId(agencyId) {
    const aId = parseInt(agencyId, 10);
    if (!Number.isFinite(aId) || aId < 1) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM agency_billing_accounts WHERE agency_id = ? LIMIT 1`,
      [aId]
    );
    return rows[0] || null;
  }

  static async updatePricingOverride(agencyId, pricingOverrideJson) {
    const aId = parseInt(agencyId, 10);
    await pool.execute(
      `INSERT INTO agency_billing_accounts (agency_id, pricing_override_json)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE pricing_override_json = VALUES(pricing_override_json), updated_at = CURRENT_TIMESTAMP`,
      [aId, pricingOverrideJson ? JSON.stringify(pricingOverrideJson) : null]
    );
    return this.getByAgencyId(aId);
  }

  static async upsertQboConnection({
    agencyId,
    billingEmail = null,
    realmId,
    accessTokenEnc,
    refreshTokenEnc,
    tokenExpiresAt,
    scopeCsv = null,
    qboPaymentsEnabled = false
  }) {
    const aId = parseInt(agencyId, 10);
    await pool.execute(
      `INSERT INTO agency_billing_accounts
        (agency_id, billing_email, qbo_realm_id, qbo_access_token_enc, qbo_refresh_token_enc, qbo_token_expires_at, qbo_scope_csv, is_qbo_connected, qbo_payments_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE
         billing_email = COALESCE(VALUES(billing_email), billing_email),
         qbo_realm_id = VALUES(qbo_realm_id),
         qbo_access_token_enc = VALUES(qbo_access_token_enc),
         qbo_refresh_token_enc = VALUES(qbo_refresh_token_enc),
         qbo_token_expires_at = VALUES(qbo_token_expires_at),
         qbo_scope_csv = VALUES(qbo_scope_csv),
         is_qbo_connected = TRUE,
         qbo_payments_enabled = VALUES(qbo_payments_enabled),
         updated_at = CURRENT_TIMESTAMP`,
      [
        aId,
        billingEmail,
        realmId,
        accessTokenEnc ? JSON.stringify(accessTokenEnc) : null,
        refreshTokenEnc ? JSON.stringify(refreshTokenEnc) : null,
        tokenExpiresAt || null,
        scopeCsv || null,
        qboPaymentsEnabled ? 1 : 0
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
           qbo_scope_csv = NULL,
           qbo_vendor_id = NULL,
           qbo_customer_id = NULL,
           qbo_service_item_id = NULL,
           qbo_payments_enabled = FALSE,
           qbo_payments_merchant_id = NULL,
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

  static async updateSettings(agencyId, { billingEmail = undefined, autopayEnabled = undefined } = {}) {
    const aId = parseInt(agencyId, 10);
    if (!aId) throw new Error('Invalid agencyId');
    const fields = [];
    const values = [];
    if (billingEmail !== undefined) {
      fields.push('billing_email = ?');
      values.push(billingEmail || null);
    }
    if (autopayEnabled !== undefined) {
      fields.push('autopay_enabled = ?');
      values.push(autopayEnabled ? 1 : 0);
    }
    if (!fields.length) return this.getByAgencyId(aId);
    await pool.execute(
      `INSERT INTO agency_billing_accounts (agency_id, billing_email, autopay_enabled)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP`,
      [
        aId,
        billingEmail !== undefined ? (billingEmail || null) : null,
        autopayEnabled ? 1 : 0
      ]
    );
    return this.getByAgencyId(aId);
  }

  static async setSubscriptionMerchantMode(agencyId, {
    subscriptionMerchantMode,
    subscriptionProviderConnectionId = undefined,
    resetSubscriptionProcessorState = false
  } = {}) {
    const aId = parseInt(agencyId, 10);
    if (!aId) throw new Error('Invalid agencyId');
    await pool.execute(
      `INSERT INTO agency_billing_accounts (agency_id, subscription_merchant_mode, subscription_provider_connection_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         subscription_merchant_mode = VALUES(subscription_merchant_mode),
         subscription_provider_connection_id = VALUES(subscription_provider_connection_id),
         ${resetSubscriptionProcessorState ? 'payment_customer_ref = NULL, qbo_customer_id = NULL,' : ''}
         updated_at = CURRENT_TIMESTAMP`,
      [
        aId,
        subscriptionMerchantMode || 'agency_managed',
        subscriptionProviderConnectionId === undefined ? null : (subscriptionProviderConnectionId ? Number(subscriptionProviderConnectionId) : null)
      ]
    );
    return this.getByAgencyId(aId);
  }

  static async setClientPaymentsMode(agencyId, {
    clientPaymentsMode,
    clientPaymentsProviderConnectionId = undefined
  } = {}) {
    const aId = parseInt(agencyId, 10);
    if (!aId) throw new Error('Invalid agencyId');
    await pool.execute(
      `INSERT INTO agency_billing_accounts (agency_id, client_payments_mode, client_payments_provider_connection_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         client_payments_mode = VALUES(client_payments_mode),
         client_payments_provider_connection_id = VALUES(client_payments_provider_connection_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        aId,
        clientPaymentsMode || 'not_configured',
        clientPaymentsProviderConnectionId === undefined ? null : (clientPaymentsProviderConnectionId ? Number(clientPaymentsProviderConnectionId) : null)
      ]
    );
    return this.getByAgencyId(aId);
  }

  static async setPaymentCustomerRef(agencyId, { paymentProcessor = null, paymentCustomerRef = null } = {}) {
    const aId = parseInt(agencyId, 10);
    await pool.execute(
      `INSERT INTO agency_billing_accounts (agency_id, payment_processor, payment_customer_ref)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         payment_processor = VALUES(payment_processor),
         payment_customer_ref = VALUES(payment_customer_ref),
         updated_at = CURRENT_TIMESTAMP`,
      [aId, paymentProcessor || null, paymentCustomerRef || null]
    );
    return this.getByAgencyId(aId);
  }

  static async setQboCustomerId(agencyId, customerId) {
    const aId = parseInt(agencyId, 10);
    await pool.execute(
      `INSERT INTO agency_billing_accounts (agency_id, qbo_customer_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE qbo_customer_id = VALUES(qbo_customer_id), updated_at = CURRENT_TIMESTAMP`,
      [aId, customerId || null]
    );
    return this.getByAgencyId(aId);
  }

  static async setQboServiceItemId(agencyId, serviceItemId) {
    const aId = parseInt(agencyId, 10);
    await pool.execute(
      `INSERT INTO agency_billing_accounts (agency_id, qbo_service_item_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE qbo_service_item_id = VALUES(qbo_service_item_id), updated_at = CURRENT_TIMESTAMP`,
      [aId, serviceItemId || null]
    );
    return this.getByAgencyId(aId);
  }

  static async setQboPaymentsCapability(agencyId, { qboPaymentsEnabled = false, qboPaymentsMerchantId = null, scopeCsv = undefined } = {}) {
    const aId = parseInt(agencyId, 10);
    await pool.execute(
      `INSERT INTO agency_billing_accounts (agency_id, qbo_payments_enabled, qbo_payments_merchant_id, qbo_scope_csv)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         qbo_payments_enabled = VALUES(qbo_payments_enabled),
         qbo_payments_merchant_id = VALUES(qbo_payments_merchant_id),
         qbo_scope_csv = COALESCE(VALUES(qbo_scope_csv), qbo_scope_csv),
         updated_at = CURRENT_TIMESTAMP`,
      [aId, qboPaymentsEnabled ? 1 : 0, qboPaymentsMerchantId || null, scopeCsv === undefined ? null : (scopeCsv || null)]
    );
    return this.getByAgencyId(aId);
  }

  static async clearSubscriptionProcessorState(agencyId) {
    const aId = parseInt(agencyId, 10);
    await pool.execute(
      `UPDATE agency_billing_accounts
       SET payment_customer_ref = NULL,
           qbo_customer_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ?`,
      [aId]
    );
    return this.getByAgencyId(aId);
  }
}

export default AgencyBillingAccount;

