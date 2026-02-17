import pool from '../config/database.js';

class ClientGuardian {
  static _hasRelationshipTypeColumn = null;

  static async hasRelationshipTypeColumn() {
    if (this._hasRelationshipTypeColumn !== null) return this._hasRelationshipTypeColumn;
    try {
      const [rows] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_guardians' AND COLUMN_NAME = 'relationship_type' LIMIT 1"
      );
      this._hasRelationshipTypeColumn = (rows || []).length > 0;
    } catch {
      this._hasRelationshipTypeColumn = false;
    }
    return this._hasRelationshipTypeColumn;
  }

  static normalizeRelationshipType(value) {
    const k = String(value || '').trim().toLowerCase();
    if (k === 'self' || k === 'guardian' || k === 'proxy') return k;
    return 'guardian';
  }

  static async listForClient(clientId) {
    const cid = Number(clientId);
    if (!cid) return [];
    const hasRelationshipType = await this.hasRelationshipTypeColumn();
    const [rows] = await pool.execute(
      `SELECT
         cg.client_id,
         cg.guardian_user_id,
         ${hasRelationshipType ? 'cg.relationship_type,' : "'guardian' AS relationship_type,"}
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

  static async upsertLink({ clientId, guardianUserId, relationshipType, relationshipTitle, accessEnabled, permissionsJson, createdByUserId }) {
    const cid = Number(clientId);
    const uid = Number(guardianUserId);
    if (!cid || !uid) throw new Error('clientId and guardianUserId are required');
    const hasRelationshipType = await this.hasRelationshipTypeColumn();
    const relType = this.normalizeRelationshipType(relationshipType);
    const title = String(relationshipTitle || 'Guardian').trim() || 'Guardian';
    const enabled = accessEnabled === false ? 0 : 1;
    const pj = permissionsJson ? JSON.stringify(permissionsJson) : null;
    const createdBy = createdByUserId ? Number(createdByUserId) : null;

    if (hasRelationshipType) {
      await pool.execute(
        `INSERT INTO client_guardians
          (client_id, guardian_user_id, relationship_type, relationship_title, access_enabled, permissions_json, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           relationship_type = VALUES(relationship_type),
           relationship_title = VALUES(relationship_title),
           access_enabled = VALUES(access_enabled),
           permissions_json = VALUES(permissions_json)`,
        [cid, uid, relType, title, enabled, pj, createdBy]
      );
    } else {
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
    }
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
    const hasRelationshipType = await this.hasRelationshipTypeColumn();
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
         ${hasRelationshipType ? 'cg.relationship_type,' : "'guardian' AS relationship_type,"}
         cg.relationship_title
       FROM client_guardians cg
       JOIN clients c ON c.id = cg.client_id
       JOIN agencies o ON o.id = c.organization_id
       JOIN agencies a ON a.id = c.agency_id
       WHERE cg.guardian_user_id = ?
         AND cg.access_enabled = 1
         AND (c.guardian_portal_enabled = 1 ${hasRelationshipType ? "OR cg.relationship_type = 'self'" : ''})
       ORDER BY o.name, c.initials`,
      [uid]
    );
    return rows || [];
  }
}

export default ClientGuardian;

