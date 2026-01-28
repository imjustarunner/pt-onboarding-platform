import pool from '../config/database.js';

class ClientGuardian {
  static async listForClient(clientId) {
    const cid = Number(clientId);
    if (!cid) return [];
    const [rows] = await pool.execute(
      `SELECT
         cg.client_id,
         cg.guardian_user_id,
         cg.relationship_title,
         cg.access_enabled,
         cg.permissions_json,
         cg.created_at,
         u.first_name,
         u.last_name,
         u.email,
         u.status,
         u.role
       FROM client_guardians cg
       JOIN users u ON u.id = cg.guardian_user_id
       WHERE cg.client_id = ?
       ORDER BY cg.created_at DESC`,
      [cid]
    );
    return (rows || []).map((r) => ({
      ...r,
      permissions_json: r.permissions_json ? (typeof r.permissions_json === 'string' ? JSON.parse(r.permissions_json) : r.permissions_json) : null
    }));
  }

  static async upsertLink({ clientId, guardianUserId, relationshipTitle, accessEnabled, permissionsJson, createdByUserId }) {
    const cid = Number(clientId);
    const uid = Number(guardianUserId);
    if (!cid || !uid) throw new Error('clientId and guardianUserId are required');
    const title = String(relationshipTitle || 'Guardian').trim() || 'Guardian';
    const enabled = accessEnabled === false ? 0 : 1;
    const pj = permissionsJson ? JSON.stringify(permissionsJson) : null;
    const createdBy = createdByUserId ? Number(createdByUserId) : null;

    await pool.execute(
      `INSERT INTO client_guardians
        (client_id, guardian_user_id, relationship_title, access_enabled, permissions_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         relationship_title = VALUES(relationship_title),
         access_enabled = VALUES(access_enabled),
         permissions_json = VALUES(permissions_json)`,
      [cid, uid, title, enabled, pj, createdBy]
    );
    return true;
  }

  static async removeLink({ clientId, guardianUserId }) {
    const cid = Number(clientId);
    const uid = Number(guardianUserId);
    if (!cid || !uid) return false;
    const [r] = await pool.execute(
      'DELETE FROM client_guardians WHERE client_id = ? AND guardian_user_id = ?',
      [cid, uid]
    );
    return (r?.affectedRows || 0) > 0;
  }

  static async listClientsForGuardian({ guardianUserId }) {
    const uid = Number(guardianUserId);
    if (!uid) return [];
    const [rows] = await pool.execute(
      `SELECT
         c.id AS client_id,
         c.initials,
         c.status,
         c.document_status,
         c.submission_date,
         c.organization_id,
         c.agency_id,
         c.guardian_portal_enabled,
         o.name AS organization_name,
         o.organization_type AS organization_type,
         o.slug AS organization_slug,
         a.name AS agency_name,
         a.slug AS agency_slug,
         cg.relationship_title
       FROM client_guardians cg
       JOIN clients c ON c.id = cg.client_id
       JOIN agencies o ON o.id = c.organization_id
       JOIN agencies a ON a.id = c.agency_id
       WHERE cg.guardian_user_id = ?
         AND cg.access_enabled = 1
         AND c.guardian_portal_enabled = 1
       ORDER BY o.name, c.initials`,
      [uid]
    );
    return rows || [];
  }
}

export default ClientGuardian;

