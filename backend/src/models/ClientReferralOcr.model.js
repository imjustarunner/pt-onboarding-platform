import pool from '../config/database.js';

class ClientReferralOcr {
  static async create({ clientId, phiDocumentId, requestedByUserId = null, status = 'queued' }) {
    const [result] = await pool.execute(
      `INSERT INTO client_referral_ocr_requests
       (client_id, phi_document_id, requested_by_user_id, status)
       VALUES (?, ?, ?, ?)`,
      [clientId, phiDocumentId, requestedByUserId, status]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM client_referral_ocr_requests WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  static async findByClientId(clientId) {
    const [rows] = await pool.execute(
      `SELECT * FROM client_referral_ocr_requests
       WHERE client_id = ?
       ORDER BY created_at DESC, id DESC`,
      [clientId]
    );
    return rows;
  }
}

export default ClientReferralOcr;
