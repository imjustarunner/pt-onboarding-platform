import pool from '../config/database.js';

// Queued create/update/delete proposals against referral_directory_entries.
// See migration 737 and referralDirectory.controller.js for apply logic.

const CHANGE_REQUEST_SELECT = `
  SELECT r.*,
    e.name  AS entry_current_name,
    e.category_id AS entry_current_category_id,
    e.organization_name AS entry_current_organization_name,
    e.phone AS entry_current_phone,
    e.email AS entry_current_email,
    e.website AS entry_current_website,
    e.address AS entry_current_address,
    e.specialties AS entry_current_specialties,
    e.insurances_accepted AS entry_current_insurances_accepted,
    e.notes AS entry_current_notes,
    e.is_active AS entry_current_is_active,
    s.first_name AS submitted_by_first_name,
    s.last_name  AS submitted_by_last_name,
    rv.first_name AS reviewed_by_first_name,
    rv.last_name  AS reviewed_by_last_name
  FROM referral_directory_change_requests r
  LEFT JOIN referral_directory_entries e ON e.id = r.entry_id
  LEFT JOIN users s  ON s.id = r.submitted_by_user_id
  LEFT JOIN users rv ON rv.id = r.reviewed_by_user_id
`;

class ReferralDirectoryChangeRequest {
  static async findById(id) {
    const [rows] = await pool.execute(
      `${CHANGE_REQUEST_SELECT} WHERE r.id = ? LIMIT 1`,
      [id]
    );
    const row = rows[0] || null;
    if (row?.proposed_payload && typeof row.proposed_payload === 'string') {
      try { row.proposed_payload = JSON.parse(row.proposed_payload); } catch { /* leave as string */ }
    }
    return row;
  }

  static async create({ agencyId, entryId = null, changeType, proposedPayload = null, submittedByUserId }) {
    if (!['create', 'update', 'delete'].includes(String(changeType))) {
      throw new Error(`Invalid changeType: ${changeType}`);
    }
    const payloadJson = proposedPayload ? JSON.stringify(proposedPayload) : null;
    const [ins] = await pool.execute(
      `INSERT INTO referral_directory_change_requests
        (agency_id, entry_id, change_type, proposed_payload, submitted_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, entryId, changeType, payloadJson, submittedByUserId]
    );
    return this.findById(ins.insertId);
  }

  static async listPendingForAgency(agencyId, { limit = 100 } = {}) {
    const lim = Math.max(1, Math.min(500, Number(limit) || 100));
    const [rows] = await pool.execute(
      `${CHANGE_REQUEST_SELECT}
       WHERE r.agency_id = ? AND r.status = 'pending'
       ORDER BY r.created_at ASC
       LIMIT ${lim}`,
      [agencyId]
    );
    for (const row of rows || []) {
      if (row?.proposed_payload && typeof row.proposed_payload === 'string') {
        try { row.proposed_payload = JSON.parse(row.proposed_payload); } catch { /* leave */ }
      }
    }
    return rows || [];
  }

  static async listHistoryForAgency(agencyId, { limit = 100, status = null } = {}) {
    const lim = Math.max(1, Math.min(500, Number(limit) || 100));
    const params = [agencyId];
    let where = 'r.agency_id = ?';
    if (status) {
      where += ' AND r.status = ?';
      params.push(status);
    }
    const [rows] = await pool.execute(
      `${CHANGE_REQUEST_SELECT}
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT ${lim}`,
      params
    );
    for (const row of rows || []) {
      if (row?.proposed_payload && typeof row.proposed_payload === 'string') {
        try { row.proposed_payload = JSON.parse(row.proposed_payload); } catch { /* leave */ }
      }
    }
    return rows || [];
  }

  static async countPendingForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM referral_directory_change_requests
       WHERE agency_id = ? AND status = 'pending'`,
      [agencyId]
    );
    return Number(rows[0]?.cnt || 0);
  }

  static async markReviewed(id, { status, reviewerUserId, adminNotes = null }) {
    if (!['approved', 'rejected'].includes(String(status))) {
      throw new Error(`Invalid review status: ${status}`);
    }
    const [r] = await pool.execute(
      `UPDATE referral_directory_change_requests
       SET status = ?, reviewed_by_user_id = ?, reviewed_at = NOW(), admin_notes = ?
       WHERE id = ? AND status = 'pending'`,
      [status, reviewerUserId, adminNotes, id]
    );
    if (r.affectedRows === 0) return null;
    return this.findById(id);
  }
}

export default ReferralDirectoryChangeRequest;
