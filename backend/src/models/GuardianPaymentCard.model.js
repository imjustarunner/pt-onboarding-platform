import pool from '../config/database.js';

export default class GuardianPaymentCard {
  static async create({
    guardianUserId,
    agencyId,
    qbPaymentCustomerId,
    qbCardId,
    cardBrand = null,
    cardLast4 = null,
    cardExpMonth = null,
    cardExpYear = null,
    cardholderName = null,
    autoCharge = false,
    isDefault = false,
    intakeSubmissionId = null
  }) {
    // Set existing cards for this guardian+agency as non-default if this is default.
    if (isDefault) {
      await pool.query(
        'UPDATE guardian_payment_cards SET is_default = 0 WHERE guardian_user_id = ? AND agency_id = ?',
        [guardianUserId, agencyId]
      );
    }
    const [result] = await pool.query(
      `INSERT INTO guardian_payment_cards
        (guardian_user_id, agency_id, qb_payment_customer_id, qb_card_id,
         card_brand, card_last4, card_exp_month, card_exp_year, cardholder_name,
         auto_charge, is_default, intake_submission_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         card_brand               = VALUES(card_brand),
         card_last4               = VALUES(card_last4),
         card_exp_month           = VALUES(card_exp_month),
         card_exp_year            = VALUES(card_exp_year),
         cardholder_name          = VALUES(cardholder_name),
         auto_charge              = VALUES(auto_charge),
         is_active                = 1,
         updated_at               = CURRENT_TIMESTAMP`,
      [
        guardianUserId, agencyId, qbPaymentCustomerId || null, qbCardId,
        cardBrand, cardLast4, cardExpMonth, cardExpYear, cardholderName,
        autoCharge ? 1 : 0, isDefault ? 1 : 0, intakeSubmissionId || null
      ]
    );
    return result.insertId || null;
  }

  static async findActiveByGuardian(guardianUserId, agencyId) {
    const [rows] = await pool.query(
      `SELECT * FROM guardian_payment_cards
       WHERE guardian_user_id = ? AND agency_id = ? AND is_active = 1
       ORDER BY is_default DESC, added_at DESC`,
      [guardianUserId, agencyId]
    );
    return rows;
  }

  static async findDefaultForGuardian(guardianUserId, agencyId) {
    const [rows] = await pool.query(
      `SELECT * FROM guardian_payment_cards
       WHERE guardian_user_id = ? AND agency_id = ? AND is_active = 1
       ORDER BY is_default DESC, added_at DESC LIMIT 1`,
      [guardianUserId, agencyId]
    );
    return rows[0] || null;
  }

  static async deactivate(cardId, guardianUserId) {
    await pool.query(
      'UPDATE guardian_payment_cards SET is_active = 0 WHERE id = ? AND guardian_user_id = ?',
      [cardId, guardianUserId]
    );
  }
}
