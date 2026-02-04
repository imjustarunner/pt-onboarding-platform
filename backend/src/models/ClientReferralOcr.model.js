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

  static async updateById(id, updates) {
    if (!id || !updates) return this.findById(id);
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE client_referral_ocr_requests SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default ClientReferralOcr;
