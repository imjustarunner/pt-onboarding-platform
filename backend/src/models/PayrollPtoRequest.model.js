import pool from '../config/database.js';

class PayrollPtoRequest {
  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM payroll_pto_requests WHERE id = ? LIMIT 1`, [id]);
    return rows?.[0] || null;
  }

  static async listForAgency({ agencyId, status = null, limit = 200 }) {
    const lim = Math.max(1, Math.min(500, Number(limit || 200)));
    const params = [agencyId];
    let where = 'WHERE agency_id = ?';
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_pto_requests
       ${where}
       ORDER BY created_at DESC
       LIMIT ${lim}`,
      params
    );
    return rows || [];
  }

  static async listForAgencyUser({ agencyId, userId, limit = 200 }) {
    const lim = Math.max(1, Math.min(500, Number(limit || 200)));
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_pto_requests
       WHERE agency_id = ? AND user_id = ?
       ORDER BY created_at DESC
       LIMIT ${lim}`,
      [agencyId, userId]
    );
    return rows || [];
  }

  static async listItemsForRequest(requestId) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_pto_request_items
       WHERE request_id = ?
       ORDER BY request_date ASC, id ASC`,
      [requestId]
    );
    return rows || [];
  }

  static async create({
    agencyId,
    userId,
    requestType,
    notes,
    trainingDescription,
    proof,
    policyWarningsJson,
    policyAckJson,
    totalHours
  }) {
    const [res] = await pool.execute(
      `INSERT INTO payroll_pto_requests
       (agency_id, user_id, status, request_type, notes, training_description,
        proof_file_path, proof_original_name, proof_mime_type, proof_size_bytes,
        policy_warnings_json, policy_ack_json, total_hours)
       VALUES (?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        userId,
        requestType,
        notes || null,
        trainingDescription || null,
        proof?.filePath || null,
        proof?.originalName || null,
        proof?.mimeType || null,
        proof?.sizeBytes || null,
        policyWarningsJson ? JSON.stringify(policyWarningsJson) : null,
        policyAckJson ? JSON.stringify(policyAckJson) : null,
        totalHours || 0
      ]
    );
    return this.findById(res.insertId);
  }

  static async addItems({ requestId, agencyId, items }) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return 0;
    const placeholders = rows.map(() => '(?, ?, ?, ?)').join(', ');
    const params = [];
    for (const it of rows) {
      params.push(
        requestId,
        agencyId,
        it.requestDate,
        it.hours
      );
    }
    const [res] = await pool.execute(
      `INSERT INTO payroll_pto_request_items (request_id, agency_id, request_date, hours)
       VALUES ${placeholders}`,
      params
    );
    return res.affectedRows || 0;
  }

  static async updateStatus({
    requestId,
    agencyId,
    status,
    approvedByUserId = null,
    approvedAt = null,
    rejectedByUserId = null,
    rejectedAt = null,
    rejectionReason = null
  }) {
    await pool.execute(
      `UPDATE payroll_pto_requests
       SET status = ?,
           approved_by_user_id = ?,
           approved_at = ?,
           rejected_by_user_id = ?,
           rejected_at = ?,
           rejection_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND agency_id = ?`,
      [
        status,
        approvedByUserId,
        approvedAt,
        rejectedByUserId,
        rejectedAt,
        rejectionReason,
        requestId,
        agencyId
      ]
    );
    return this.findById(requestId);
  }
}

export default PayrollPtoRequest;

