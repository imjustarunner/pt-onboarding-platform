import pool from '../config/database.js';

class OrganizationAffiliationRequest {
  static async createOrReopen({ organizationId, requestingAgencyId, requestedByUserId }) {
    const oid = parseInt(organizationId, 10);
    const aid = parseInt(requestingAgencyId, 10);
    const uid = requestedByUserId ? parseInt(requestedByUserId, 10) : null;
    if (!oid || !aid) throw new Error('organizationId and requestingAgencyId are required');

    await pool.execute(
      `INSERT INTO organization_affiliation_requests
        (organization_id, requesting_agency_id, status, requested_by_user_id, resolved_by_user_id, resolved_at)
       VALUES (?, ?, 'pending', ?, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         status = CASE
           WHEN organization_affiliation_requests.status IN ('rejected', 'cancelled') THEN 'pending'
           ELSE organization_affiliation_requests.status
         END,
         requested_by_user_id = VALUES(requested_by_user_id),
         resolved_by_user_id = NULL,
         resolved_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [oid, aid, uid]
    );

    const [rows] = await pool.execute(
      `SELECT * FROM organization_affiliation_requests
       WHERE organization_id = ? AND requesting_agency_id = ? LIMIT 1`,
      [oid, aid]
    );
    return rows[0] || null;
  }

  static async findById(id) {
    const rid = parseInt(id, 10);
    if (!rid) return null;
    const [rows] = await pool.execute(`SELECT * FROM organization_affiliation_requests WHERE id = ? LIMIT 1`, [rid]);
    return rows[0] || null;
  }

  static async listForOrganization(organizationId) {
    const oid = parseInt(organizationId, 10);
    if (!oid) return [];
    const [rows] = await pool.execute(
      `SELECT r.*, a.name AS requesting_agency_name, a.slug AS requesting_agency_slug
       FROM organization_affiliation_requests r
       INNER JOIN agencies a ON a.id = r.requesting_agency_id
       WHERE r.organization_id = ?
       ORDER BY
         FIELD(r.status, 'pending', 'approved', 'rejected', 'cancelled'),
         r.updated_at DESC`,
      [oid]
    );
    return rows || [];
  }

  static async listForRequestingAgency(requestingAgencyId) {
    const aid = parseInt(requestingAgencyId, 10);
    if (!aid) return [];
    const [rows] = await pool.execute(
      `SELECT r.*, o.name AS organization_name, o.slug AS organization_slug
       FROM organization_affiliation_requests r
       INNER JOIN agencies o ON o.id = r.organization_id
       WHERE r.requesting_agency_id = ?
       ORDER BY FIELD(r.status, 'pending', 'approved', 'rejected', 'cancelled'), r.updated_at DESC`,
      [aid]
    );
    return rows || [];
  }

  static async hasApprovedRequest(organizationId, requestingAgencyId) {
    const oid = parseInt(organizationId, 10);
    const aid = parseInt(requestingAgencyId, 10);
    if (!oid || !aid) return false;
    const [rows] = await pool.execute(
      `SELECT id FROM organization_affiliation_requests
       WHERE organization_id = ? AND requesting_agency_id = ? AND status = 'approved'
       LIMIT 1`,
      [oid, aid]
    );
    return !!(rows && rows[0]);
  }

  static async setStatus(id, status, resolvedByUserId) {
    const rid = parseInt(id, 10);
    if (!rid) return null;
    const uid = resolvedByUserId ? parseInt(resolvedByUserId, 10) : null;
    await pool.execute(
      `UPDATE organization_affiliation_requests
       SET status = ?, resolved_by_user_id = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, uid, rid]
    );
    return this.findById(rid);
  }
}

export default OrganizationAffiliationRequest;
