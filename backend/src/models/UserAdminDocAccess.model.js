import pool from '../config/database.js';

class UserAdminDocAccess {
  // Requests
  static async createRequest({ userId, docId = null, requestedByUserId, reason = null }) {
    const [result] = await pool.execute(
      `INSERT INTO user_admin_doc_access_requests (
        user_id, doc_id, requested_by_user_id, reason, status
      ) VALUES (?, ?, ?, ?, 'pending')`,
      [userId, docId, requestedByUserId, reason]
    );
    return this.findRequestById(result.insertId);
  }

  static async findRequestById(id) {
    const [rows] = await pool.execute(
      `SELECT r.*,
              rb.first_name AS requested_by_first_name,
              rb.last_name AS requested_by_last_name,
              rb.email AS requested_by_email,
              rev.first_name AS reviewed_by_first_name,
              rev.last_name AS reviewed_by_last_name,
              rev.email AS reviewed_by_email
       FROM user_admin_doc_access_requests r
       LEFT JOIN users rb ON rb.id = r.requested_by_user_id
       LEFT JOIN users rev ON rev.id = r.reviewed_by_user_id
       WHERE r.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  static async findLatestRequestsForRequester({ userId, requestedByUserId }) {
    // Return latest request per scope (doc_id) for a requester.
    const [rows] = await pool.execute(
      `SELECT r.*
       FROM user_admin_doc_access_requests r
       INNER JOIN (
         SELECT COALESCE(doc_id, 0) AS doc_key, MAX(requested_at) AS max_requested_at
         FROM user_admin_doc_access_requests
         WHERE user_id = ? AND requested_by_user_id = ?
         GROUP BY COALESCE(doc_id, 0)
       ) t ON t.doc_key = COALESCE(r.doc_id, 0) AND t.max_requested_at = r.requested_at
       WHERE r.user_id = ? AND r.requested_by_user_id = ?`,
      [userId, requestedByUserId, userId, requestedByUserId]
    );
    return rows;
  }

  static async findPendingRequest({ userId, docId = null, requestedByUserId }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM user_admin_doc_access_requests
       WHERE user_id = ?
         AND requested_by_user_id = ?
         AND ((doc_id IS NULL AND ? IS NULL) OR doc_id = ?)
         AND status = 'pending'
       ORDER BY requested_at DESC
       LIMIT 1`,
      [userId, requestedByUserId, docId, docId]
    );
    return rows[0] || null;
  }

  static async listRequestsForUser({ userId, includeAll = false, requestedByUserId = null }) {
    const where = [];
    const params = [];
    where.push('r.user_id = ?');
    params.push(userId);

    if (!includeAll) {
      where.push('r.requested_by_user_id = ?');
      params.push(requestedByUserId);
    }

    const [rows] = await pool.execute(
      `SELECT r.*,
              rb.first_name AS requested_by_first_name,
              rb.last_name AS requested_by_last_name,
              rb.email AS requested_by_email,
              rev.first_name AS reviewed_by_first_name,
              rev.last_name AS reviewed_by_last_name,
              rev.email AS reviewed_by_email
       FROM user_admin_doc_access_requests r
       LEFT JOIN users rb ON rb.id = r.requested_by_user_id
       LEFT JOIN users rev ON rev.id = r.reviewed_by_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.requested_at DESC`,
      params
    );
    return rows;
  }

  static async approveRequest({ requestId, reviewedByUserId }) {
    await pool.execute(
      `UPDATE user_admin_doc_access_requests
       SET status = 'approved',
           reviewed_by_user_id = ?,
           reviewed_at = NOW()
       WHERE id = ?`,
      [reviewedByUserId, requestId]
    );
    return this.findRequestById(requestId);
  }

  static async denyRequest({ requestId, reviewedByUserId }) {
    await pool.execute(
      `UPDATE user_admin_doc_access_requests
       SET status = 'denied',
           reviewed_by_user_id = ?,
           reviewed_at = NOW()
       WHERE id = ?`,
      [reviewedByUserId, requestId]
    );
    return this.findRequestById(requestId);
  }

  // Grants
  static async createGrant({ userId, docId = null, granteeUserId, grantedByUserId, expiresAt = null }) {
    const [result] = await pool.execute(
      `INSERT INTO user_admin_doc_access_grants (
        user_id, doc_id, grantee_user_id, granted_by_user_id, expires_at
      ) VALUES (?, ?, ?, ?, ?)`,
      [userId, docId, granteeUserId, grantedByUserId, expiresAt]
    );
    return this.findGrantById(result.insertId);
  }

  static async findGrantById(id) {
    const [rows] = await pool.execute(
      `SELECT g.*,
              gu.first_name AS grantee_first_name,
              gu.last_name AS grantee_last_name,
              gu.email AS grantee_email,
              gb.first_name AS granted_by_first_name,
              gb.last_name AS granted_by_last_name,
              gb.email AS granted_by_email
       FROM user_admin_doc_access_grants g
       LEFT JOIN users gu ON gu.id = g.grantee_user_id
       LEFT JOIN users gb ON gb.id = g.granted_by_user_id
       WHERE g.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  static async listActiveGrantsForGrantee({ userId, granteeUserId }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM user_admin_doc_access_grants
       WHERE user_id = ?
         AND grantee_user_id = ?
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY granted_at DESC`,
      [userId, granteeUserId]
    );
    return rows;
  }

  static async listGrantsForUser({ userId }) {
    const [rows] = await pool.execute(
      `SELECT g.*,
              gu.first_name AS grantee_first_name,
              gu.last_name AS grantee_last_name,
              gu.email AS grantee_email,
              gb.first_name AS granted_by_first_name,
              gb.last_name AS granted_by_last_name,
              gb.email AS granted_by_email,
              rv.first_name AS revoked_by_first_name,
              rv.last_name AS revoked_by_last_name,
              rv.email AS revoked_by_email
       FROM user_admin_doc_access_grants g
       LEFT JOIN users gu ON gu.id = g.grantee_user_id
       LEFT JOIN users gb ON gb.id = g.granted_by_user_id
       LEFT JOIN users rv ON rv.id = g.revoked_by_user_id
       WHERE g.user_id = ?
       ORDER BY g.granted_at DESC`,
      [userId]
    );
    return rows;
  }

  static async revokeGrant({ grantId, revokedByUserId }) {
    await pool.execute(
      `UPDATE user_admin_doc_access_grants
       SET revoked_at = NOW(),
           revoked_by_user_id = ?
       WHERE id = ?`,
      [revokedByUserId, grantId]
    );
    return this.findGrantById(grantId);
  }

  // Access log
  static async logOpen({ docId, viewerUserId, ip = null, userAgent = null }) {
    const [result] = await pool.execute(
      `INSERT INTO user_admin_doc_access_log (
        doc_id, viewer_user_id, ip, user_agent
      ) VALUES (?, ?, ?, ?)`,
      [docId, viewerUserId, ip, userAgent]
    );
    return result.insertId;
  }

  static async purgeByDocId(docId) {
    await pool.execute('DELETE FROM user_admin_doc_access_log WHERE doc_id = ?', [docId]);
    await pool.execute('DELETE FROM user_admin_doc_access_grants WHERE doc_id = ?', [docId]);
    await pool.execute('DELETE FROM user_admin_doc_access_requests WHERE doc_id = ?', [docId]);
  }
}

export default UserAdminDocAccess;

