import pool from '../config/database.js';

class AgencyBillingPaymentMethod {
  static async listByAgency(agencyId, { billingDomain = 'agency_subscription', merchantMode = undefined } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const params = [aid, String(billingDomain || 'agency_subscription')];
    let merchantClause = '';
    if (merchantMode) {
      merchantClause = ' AND merchant_mode = ?';
      params.push(String(merchantMode));
    }
    const [rows] = await pool.execute(
      `SELECT id, agency_id, provider, provider_customer_id, provider_payment_method_id,
              billing_domain, merchant_mode, provider_connection_id,
              card_brand, last4, exp_month, exp_year, is_default, is_active,
              created_by_user_id, updated_by_user_id, created_at, updated_at
       FROM agency_billing_payment_methods
       WHERE agency_id = ?
         AND billing_domain = ?
         AND is_active = TRUE
         ${merchantClause}
       ORDER BY is_default DESC, updated_at DESC, id DESC`,
      params
    );
    return rows || [];
  }

  static async findById(id) {
    const pid = Number(id || 0);
    if (!pid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_billing_payment_methods
       WHERE id = ?
       LIMIT 1`,
      [pid]
    );
    return rows?.[0] || null;
  }

  static async getDefaultForAgency(agencyId, { billingDomain = 'agency_subscription', merchantMode = undefined } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return null;
    const params = [aid, String(billingDomain || 'agency_subscription')];
    let merchantClause = '';
    if (merchantMode) {
      merchantClause = ' AND merchant_mode = ?';
      params.push(String(merchantMode));
    }
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_billing_payment_methods
       WHERE agency_id = ?
         AND billing_domain = ?
         AND is_active = TRUE
         AND is_default = TRUE
         ${merchantClause}
       ORDER BY id DESC
       LIMIT 1`,
      params
    );
    return rows?.[0] || null;
  }

  static async createFromProcessor({
    agencyId,
    billingDomain = 'agency_subscription',
    merchantMode = 'agency_managed',
    providerConnectionId = null,
    createdByUserId = null,
    provider = 'QUICKBOOKS_PAYMENTS',
    providerCustomerId = null,
    providerPaymentMethodId = null,
    cardBrand = null,
    last4 = null,
    expMonth = null,
    expYear = null,
    isDefault = true
  }) {
    const aid = Number(agencyId || 0);
    if (!aid) throw new Error('Invalid agencyId');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (isDefault) {
        await conn.execute(
          `UPDATE agency_billing_payment_methods
           SET is_default = FALSE,
               updated_at = CURRENT_TIMESTAMP
           WHERE agency_id = ?
             AND billing_domain = ?`,
          [aid, String(billingDomain || 'agency_subscription')]
        );
      }
      const [result] = await conn.execute(
        `INSERT INTO agency_billing_payment_methods
           (agency_id, billing_domain, merchant_mode, provider, provider_connection_id,
            provider_customer_id, provider_payment_method_id,
            card_brand, last4, exp_month, exp_year, is_default, is_active,
            created_by_user_id, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
        [
          aid,
          String(billingDomain || 'agency_subscription'),
          String(merchantMode || 'agency_managed'),
          String(provider || 'QUICKBOOKS_PAYMENTS').trim().toUpperCase(),
          providerConnectionId ? Number(providerConnectionId) : null,
          providerCustomerId,
          providerPaymentMethodId,
          cardBrand,
          last4,
          expMonth,
          expYear,
          isDefault ? 1 : 0,
          createdByUserId ? Number(createdByUserId) : null,
          createdByUserId ? Number(createdByUserId) : null
        ]
      );
      await conn.commit();
      return await this.findById(result.insertId);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  static async deactivateById({ agencyId, paymentMethodId, updatedByUserId = null, billingDomain = undefined }) {
    const aid = Number(agencyId || 0);
    const pid = Number(paymentMethodId || 0);
    if (!aid || !pid) return null;
    const params = [updatedByUserId ? Number(updatedByUserId) : null, pid, aid];
    let domainClause = '';
    if (billingDomain) {
      domainClause = ' AND billing_domain = ?';
      params.push(String(billingDomain));
    }
    await pool.execute(
      `UPDATE agency_billing_payment_methods
       SET is_active = FALSE,
           is_default = FALSE,
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND agency_id = ?
         ${domainClause}`,
      params
    );
    return this.findById(pid);
  }

  static async deactivateAllForAgency({ agencyId, updatedByUserId = null, billingDomain = 'agency_subscription' } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    await pool.execute(
      `UPDATE agency_billing_payment_methods
       SET is_active = FALSE,
           is_default = FALSE,
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ?
         AND billing_domain = ?`,
      [updatedByUserId ? Number(updatedByUserId) : null, aid, String(billingDomain || 'agency_subscription')]
    );
    return this.listByAgency(aid, { billingDomain, merchantMode: undefined });
  }

  static async setDefault({ agencyId, paymentMethodId, updatedByUserId = null, billingDomain = 'agency_subscription' }) {
    const aid = Number(agencyId || 0);
    const pid = Number(paymentMethodId || 0);
    if (!aid || !pid) throw new Error('Invalid payment method selection');
    const domain = String(billingDomain || 'agency_subscription');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE agency_billing_payment_methods
         SET is_default = FALSE,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE agency_id = ?
           AND billing_domain = ?`,
        [updatedByUserId ? Number(updatedByUserId) : null, aid, domain]
      );
      await conn.execute(
        `UPDATE agency_billing_payment_methods
         SET is_default = TRUE,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND agency_id = ?
           AND billing_domain = ?
           AND is_active = TRUE`,
        [updatedByUserId ? Number(updatedByUserId) : null, pid, aid, domain]
      );
      await conn.commit();
      return this.findById(pid);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default AgencyBillingPaymentMethod;
