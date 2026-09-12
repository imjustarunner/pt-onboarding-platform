import crypto from 'node:crypto';
import pool from '../config/database.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../services/familyBillingEncryption.service.js';
import { billingError } from '../services/familyBillingPolicy.service.js';

export const PRIVATE_CARD_COLUMNS = ['qb_payment_customer_id','qb_card_id','stripe_customer_id','stripe_payment_method_id','card_brand','card_last4','card_exp_month','card_exp_year','cardholder_name'];
export function decodePaymentCard(row) {
  if (!row) return null;
  const result = { ...row, ...(decryptFamilyBilling(row.private_payload, `card:${row.agency_id}:${row.guardian_user_id}`) || {}) };
  delete result.private_payload;
  return result;
}
export function paymentCardSummary(card) {
  return { verificationRequired: card.legacyRequiresReview === true, ...Object.fromEntries(['id','card_brand','card_last4','card_exp_month','card_exp_year','cardholder_name','is_default','is_active','added_at'].map(k => [k, card[k]])) };
}
export default class GuardianPaymentCard {
  static async create({ guardianUserId, agencyId, paymentProvider = 'STRIPE', stripeCustomerId, stripePaymentMethodId, connectedAccountId, setupIntentId, cardBrand, cardLast4, cardExpMonth, cardExpYear, cardholderName, intakeSubmissionId = null }, db = pool) {
    if (paymentProvider !== 'STRIPE' || !stripeCustomerId || !stripePaymentMethodId || !connectedAccountId || !setupIntentId) throw billingError(400, 'A verified Stripe card setup is required');
    const fingerprint = crypto.createHash('sha256').update(`${connectedAccountId}:${stripePaymentMethodId}`).digest('hex');
    const [existing] = await db.execute('SELECT * FROM guardian_payment_cards WHERE method_fingerprint = ?', [fingerprint]);
    if (existing[0]) {
      if (Number(existing[0].guardian_user_id) !== Number(guardianUserId) || Number(existing[0].agency_id) !== Number(agencyId)) throw billingError(403, 'Payment method belongs to another account');
      // Replaying setup cannot reactivate a removed card.
      if (!existing[0].is_active) throw billingError(409, 'This card was removed. Start a new card setup.');
      return existing[0].id;
    }
    const value = { stripe_customer_id: stripeCustomerId, stripe_payment_method_id: stripePaymentMethodId, connected_account_id: connectedAccountId, card_brand: cardBrand, card_last4: cardLast4, card_exp_month: cardExpMonth, card_exp_year: cardExpYear, cardholder_name: cardholderName };
    const [result] = await db.execute(`INSERT INTO guardian_payment_cards (guardian_user_id, agency_id, payment_provider, private_payload, method_fingerprint, stripe_setup_intent_id, intake_submission_id, auto_charge, is_default) VALUES (?, ?, 'STRIPE', ?, ?, ?, ?, 0, 0)`, [guardianUserId, agencyId, encryptFamilyBilling(value, `card:${agencyId}:${guardianUserId}`), fingerprint, setupIntentId, intakeSubmissionId]);
    return result.insertId;
  }
  static async findActiveByGuardian(guardianUserId, agencyId, db = pool) {
    const [rows] = await db.execute('SELECT * FROM guardian_payment_cards WHERE guardian_user_id = ? AND agency_id = ? AND is_active = 1 ORDER BY is_default DESC, added_at DESC', [guardianUserId, agencyId]);
    return rows.map(decodePaymentCard);
  }
  static async findDefaultForGuardian(guardianUserId, agencyId) {
    return (await this.findActiveByGuardian(guardianUserId, agencyId))[0] || null;
  }
  static async deactivate(cardId, guardianUserId, agencyId) {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const [r] = await db.execute('UPDATE guardian_payment_cards SET is_active = 0, auto_charge = 0, is_default = 0 WHERE id = ? AND guardian_user_id = ? AND agency_id = ?', [cardId, guardianUserId, agencyId]);
      if (!r.affectedRows) throw billingError(404, 'Payment method not found');
      await db.execute('UPDATE guardian_billing_consents SET revoked_at = CURRENT_TIMESTAMP WHERE payment_card_id = ? AND guardian_user_id = ? AND agency_id = ? AND revoked_at IS NULL', [cardId, guardianUserId, agencyId]);
      await db.execute('UPDATE client_billing_payers SET payment_card_id = NULL, consent_id = NULL WHERE payment_card_id = ? AND guardian_user_id = ? AND agency_id = ?', [cardId, guardianUserId, agencyId]);
      await db.commit();
    } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
  }
}
