import pool from '../config/database.js';

class AgencyBillingPaymentAttempt {
  static async create({
    paymentId,
    requestPayloadJson = null,
    responsePayloadJson = null,
    processorStatus = null,
    resultStatus = 'PENDING',
    errorMessage = null
  }) {
    const pid = Number(paymentId || 0);
    if (!pid) throw new Error('Invalid paymentId');

    const [countRows] = await pool.execute(
      `SELECT COALESCE(MAX(attempt_no), 0) AS last_attempt_no
       FROM agency_billing_payment_attempts
       WHERE payment_id = ?`,
      [pid]
    );
    const attemptNo = Number(countRows?.[0]?.last_attempt_no || 0) + 1;

    const [result] = await pool.execute(
      `INSERT INTO agency_billing_payment_attempts
        (payment_id, attempt_no, request_payload_json, response_payload_json, processor_status, result_status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        pid,
        attemptNo,
        requestPayloadJson ? JSON.stringify(requestPayloadJson) : null,
        responsePayloadJson ? JSON.stringify(responsePayloadJson) : null,
        processorStatus || null,
        String(resultStatus || 'PENDING').trim().toUpperCase(),
        errorMessage || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const aid = Number(id || 0);
    if (!aid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_billing_payment_attempts
       WHERE id = ?
       LIMIT 1`,
      [aid]
    );
    return rows?.[0] || null;
  }

  static async listByPayment(paymentId) {
    const pid = Number(paymentId || 0);
    if (!pid) return [];
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_billing_payment_attempts
       WHERE payment_id = ?
       ORDER BY attempt_no ASC, id ASC`,
      [pid]
    );
    return rows || [];
  }
}

export default AgencyBillingPaymentAttempt;
