import crypto from 'crypto';
import pool from '../config/database.js';

class LearningPaymentMethod {
  static async listForOwner({ agencyId, ownerUserId, ownerClientId = null }) {
    const aid = Number(agencyId || 0);
    const uid = Number(ownerUserId || 0);
    if (!aid || !uid) return [];
    const values = [aid, uid];
    let whereClient = '';
    if (Number(ownerClientId || 0) > 0) {
      whereClient = 'AND (owner_client_id = ? OR owner_client_id IS NULL)';
      values.push(Number(ownerClientId));
    }
    const [rows] = await pool.execute(
      `SELECT id, agency_id, owner_user_id, owner_client_id, provider, card_brand, last4, exp_month, exp_year,
              is_default, is_active, created_at, updated_at
       FROM learning_payment_methods
       WHERE agency_id = ?
         AND owner_user_id = ?
         AND is_active = TRUE
         ${whereClient}
       ORDER BY is_default DESC, updated_at DESC, id DESC`,
      values
    );
    return rows || [];
  }

  static async findById(id) {
    const pid = Number(id || 0);
    if (!pid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_payment_methods
       WHERE id = ?
       LIMIT 1`,
      [pid]
    );
    return rows?.[0] || null;
  }

  static async createPlaceholder({
    agencyId,
    ownerUserId,
    ownerClientId = null,
    cardBrand = null,
    last4 = null,
    expMonth = null,
    expYear = null,
    tokenEncrypted = null,
    isDefault = true
  }) {
    const providerPaymentMethodId = `pm_placeholder_${crypto.randomBytes(6).toString('hex')}`;
    const providerCustomerId = `cust_placeholder_${ownerUserId}`;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (isDefault) {
        await conn.execute(
          `UPDATE learning_payment_methods
           SET is_default = FALSE
           WHERE agency_id = ?
             AND owner_user_id = ?`,
          [agencyId, ownerUserId]
        );
      }
      const [result] = await conn.execute(
        `INSERT INTO learning_payment_methods
           (agency_id, owner_user_id, owner_client_id, provider, provider_customer_id, provider_payment_method_id,
            card_brand, last4, exp_month, exp_year, is_default, is_active, token_encrypted)
         VALUES (?, ?, ?, 'PLACEHOLDER', ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
        [
          agencyId,
          ownerUserId,
          ownerClientId,
          providerCustomerId,
          providerPaymentMethodId,
          cardBrand,
          last4,
          expMonth,
          expYear,
          isDefault ? 1 : 0,
          tokenEncrypted
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

  static async setDefault({ agencyId, ownerUserId, paymentMethodId }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE learning_payment_methods
         SET is_default = FALSE
         WHERE agency_id = ?
           AND owner_user_id = ?`,
        [agencyId, ownerUserId]
      );
      await conn.execute(
        `UPDATE learning_payment_methods
         SET is_default = TRUE
         WHERE id = ?
           AND agency_id = ?
           AND owner_user_id = ?
           AND is_active = TRUE`,
        [paymentMethodId, agencyId, ownerUserId]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default LearningPaymentMethod;
