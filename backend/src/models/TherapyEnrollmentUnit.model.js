import pool from '../config/database.js';

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

class TherapyEnrollmentUnit {
  static async create({
    agencyId,
    unitType,
    pathway = 'quick_prospective',
    primaryContactClientId = null,
    status = 'prospective',
    meta = null
  }) {
    const type = String(unitType || '').trim().toLowerCase();
    if (type !== 'couple' && type !== 'family') {
      throw new Error('unitType must be couple or family');
    }
    const [result] = await pool.execute(
      `INSERT INTO therapy_enrollment_units
        (agency_id, unit_type, pathway, primary_contact_client_id, status, meta_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        Number(agencyId),
        type,
        pathway || null,
        primaryContactClientId ? Number(primaryContactClientId) : null,
        status || 'prospective',
        meta ? JSON.stringify(meta) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const uid = Number(id || 0);
    if (!uid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM therapy_enrollment_units WHERE id = ? LIMIT 1`,
      [uid]
    );
    const row = rows?.[0];
    if (!row) return null;
    return {
      ...row,
      meta_json: parseJson(row.meta_json, null)
    };
  }

  static async addMember({
    unitId,
    clientId,
    memberRole = 'participant',
    participationStatus = null,
    relationshipToPrimary = null,
    notifyAboutRequest = null,
    sameAddressAsPrimary = true,
    sortOrder = 0,
    meta = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO therapy_enrollment_unit_members
        (unit_id, client_id, member_role, participation_status, relationship_to_primary,
         notify_about_request, same_address_as_primary, sort_order, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         member_role = VALUES(member_role),
         participation_status = VALUES(participation_status),
         relationship_to_primary = VALUES(relationship_to_primary),
         notify_about_request = VALUES(notify_about_request),
         same_address_as_primary = VALUES(same_address_as_primary),
         sort_order = VALUES(sort_order),
         meta_json = VALUES(meta_json),
         updated_at = CURRENT_TIMESTAMP`,
      [
        Number(unitId),
        Number(clientId),
        String(memberRole || 'participant').slice(0, 64),
        participationStatus || null,
        relationshipToPrimary || null,
        notifyAboutRequest == null ? null : (notifyAboutRequest ? 1 : 0),
        sameAddressAsPrimary ? 1 : 0,
        Number(sortOrder) || 0,
        meta ? JSON.stringify(meta) : null
      ]
    );
    return result.insertId || null;
  }

  static async listMembers(unitId) {
    const uid = Number(unitId || 0);
    if (!uid) return [];
    const [rows] = await pool.execute(
      `SELECT m.*, c.first_name, c.last_name, c.date_of_birth, c.identifier_code
         FROM therapy_enrollment_unit_members m
         INNER JOIN clients c ON c.id = m.client_id
        WHERE m.unit_id = ?
        ORDER BY m.sort_order ASC, m.id ASC`,
      [uid]
    );
    return (rows || []).map((r) => ({
      ...r,
      meta_json: parseJson(r.meta_json, null)
    }));
  }

  static async findByClientId(clientId) {
    const cid = Number(clientId || 0);
    if (!cid) return null;
    const [rows] = await pool.execute(
      `SELECT u.*
         FROM therapy_enrollment_units u
         INNER JOIN therapy_enrollment_unit_members m ON m.unit_id = u.id
        WHERE m.client_id = ?
        ORDER BY u.id DESC
        LIMIT 1`,
      [cid]
    );
    const row = rows?.[0];
    if (!row) return null;
    return {
      ...row,
      meta_json: parseJson(row.meta_json, null)
    };
  }
}

export default TherapyEnrollmentUnit;
