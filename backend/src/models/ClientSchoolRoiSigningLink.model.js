import pool from '../config/database.js';

class ClientSchoolRoiSigningLink {
  static normalize(row) {
    if (!row) return null;
    const parseJson = (value) => {
      if (!value) return null;
      if (typeof value === 'object') return value;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };
    return {
      ...row,
      id: Number(row.id),
      client_id: Number(row.client_id),
      school_organization_id: Number(row.school_organization_id),
      intake_link_id: Number(row.intake_link_id),
      issued_by_user_id: row.issued_by_user_id ? Number(row.issued_by_user_id) : null,
      latest_intake_submission_id: row.latest_intake_submission_id ? Number(row.latest_intake_submission_id) : null,
      completed_client_phi_document_id: row.completed_client_phi_document_id
        ? Number(row.completed_client_phi_document_id)
        : null,
      roi_context_json: parseJson(row.roi_context_json),
      roi_response_json: parseJson(row.roi_response_json)
    };
  }

  static async findById(id) {
    const rid = Number(id || 0);
    if (!rid) return null;
    const [rows] = await pool.execute(
      `SELECT csrsl.*, il.title AS intake_link_title
       FROM client_school_roi_signing_links csrsl
       LEFT JOIN intake_links il ON il.id = csrsl.intake_link_id
       WHERE csrsl.id = ?
       LIMIT 1`,
      [rid]
    );
    return this.normalize(rows?.[0] || null);
  }

  static async findByPublicKey(publicKey) {
    const key = String(publicKey || '').trim();
    if (!key) return null;
    const [rows] = await pool.execute(
      `SELECT csrsl.*, il.title AS intake_link_title
       FROM client_school_roi_signing_links csrsl
       LEFT JOIN intake_links il ON il.id = csrsl.intake_link_id
       WHERE csrsl.public_key = ?
       LIMIT 1`,
      [key]
    );
    return this.normalize(rows?.[0] || null);
  }

  static async findForClient({ clientId, schoolOrganizationId }) {
    const cid = Number(clientId || 0);
    const sid = Number(schoolOrganizationId || 0);
    if (!cid || !sid) return null;
    const [rows] = await pool.execute(
      `SELECT csrsl.*, il.title AS intake_link_title
       FROM client_school_roi_signing_links csrsl
       LEFT JOIN intake_links il ON il.id = csrsl.intake_link_id
       WHERE csrsl.client_id = ?
         AND csrsl.school_organization_id = ?
       LIMIT 1`,
      [cid, sid]
    );
    return this.normalize(rows?.[0] || null);
  }

  static async issueForClient({
    clientId,
    schoolOrganizationId,
    intakeLinkId,
    publicKey,
    issuedByUserId = null
  }) {
    const cid = Number(clientId || 0);
    const sid = Number(schoolOrganizationId || 0);
    const linkId = Number(intakeLinkId || 0);
    const actorId = Number(issuedByUserId || 0) || null;
    const key = String(publicKey || '').trim();
    if (!cid || !sid || !linkId || !key) return null;
    await pool.execute(
      `INSERT INTO client_school_roi_signing_links
         (client_id, school_organization_id, intake_link_id, public_key, status, issued_by_user_id, issued_at,
          latest_intake_submission_id, signed_at, completed_client_phi_document_id, roi_context_json, roi_response_json, access_applied_at)
       VALUES (?, ?, ?, ?, 'issued', ?, CURRENT_TIMESTAMP, NULL, NULL, NULL, NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         intake_link_id = VALUES(intake_link_id),
         public_key = VALUES(public_key),
         status = 'issued',
         issued_by_user_id = VALUES(issued_by_user_id),
         issued_at = CURRENT_TIMESTAMP,
         latest_intake_submission_id = NULL,
         signed_at = NULL,
         completed_client_phi_document_id = NULL,
         roi_context_json = NULL,
         roi_response_json = NULL,
         access_applied_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [cid, sid, linkId, key, actorId]
    );
    return this.findForClient({ clientId: cid, schoolOrganizationId: sid });
  }

  static async markStarted({ id, intakeSubmissionId = null }) {
    const rid = Number(id || 0);
    if (!rid) return null;
    const submissionId = Number(intakeSubmissionId || 0) || null;
    await pool.execute(
      `UPDATE client_school_roi_signing_links
       SET status = 'in_progress',
           latest_intake_submission_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [submissionId, rid]
    );
    return this.findById(rid);
  }

  static async updatePayload({
    id,
    intakeSubmissionId = undefined,
    roiContext = undefined,
    roiResponse = undefined,
    accessAppliedAt = undefined
  }) {
    const rid = Number(id || 0);
    if (!rid) return null;
    const updates = [];
    const values = [];
    if (intakeSubmissionId !== undefined) {
      updates.push('latest_intake_submission_id = ?');
      values.push(Number(intakeSubmissionId || 0) || null);
    }
    if (roiContext !== undefined) {
      updates.push('roi_context_json = ?');
      values.push(roiContext ? JSON.stringify(roiContext) : null);
    }
    if (roiResponse !== undefined) {
      updates.push('roi_response_json = ?');
      values.push(roiResponse ? JSON.stringify(roiResponse) : null);
    }
    if (accessAppliedAt !== undefined) {
      updates.push('access_applied_at = ?');
      values.push(accessAppliedAt || null);
    }
    if (!updates.length) return this.findById(rid);
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(rid);
    await pool.execute(
      `UPDATE client_school_roi_signing_links
       SET ${updates.join(', ')}
       WHERE id = ?`,
      values
    );
    return this.findById(rid);
  }

  static async markCompleted({
    id,
    intakeSubmissionId = null,
    signedAt = null,
    completedClientPhiDocumentId = null
  }) {
    const rid = Number(id || 0);
    if (!rid) return null;
    const submissionId = Number(intakeSubmissionId || 0) || null;
    const phiDocumentId = Number(completedClientPhiDocumentId || 0) || null;
    await pool.execute(
      `UPDATE client_school_roi_signing_links
       SET status = 'completed',
           latest_intake_submission_id = ?,
           signed_at = ?,
           completed_client_phi_document_id = ?,
           access_applied_at = COALESCE(access_applied_at, ?),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [submissionId, signedAt || null, phiDocumentId, signedAt || null, rid]
    );
    return this.findById(rid);
  }
}

export default ClientSchoolRoiSigningLink;
