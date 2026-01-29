import pool from '../config/database.js';

class ReceivablesReportUpload {
  static async create({ agencyId, uploadedByUserId = null, originalFilename = null, minServiceDate = null, maxServiceDate = null }) {
    const [result] = await pool.execute(
      `INSERT INTO agency_receivables_report_uploads
       (agency_id, uploaded_by_user_id, original_filename, min_service_date, max_service_date)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, uploadedByUserId, originalFilename, minServiceDate, maxServiceDate]
    );
    return result.insertId;
  }

  static async listByAgency({ agencyId, limit = 50, offset = 0 }) {
    const lim = Math.max(0, Math.min(500, parseInt(limit, 10) || 50));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const [rows] = await pool.execute(
      `SELECT aru.*
       FROM agency_receivables_report_uploads aru
       WHERE aru.agency_id = ?
       ORDER BY aru.created_at DESC, aru.id DESC
       LIMIT ${lim} OFFSET ${off}`,
      [agencyId]
    );
    return rows || [];
  }
}

export default ReceivablesReportUpload;

