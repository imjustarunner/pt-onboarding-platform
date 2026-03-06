import pool from '../config/database.js';

function normalizeAccessLevel(level) {
  const normalized = String(level || '').trim().toLowerCase();
  return normalized === 'roi' ? 'roi' : 'packet';
}

function toBool(value) {
  return value === true || value === 1 || value === '1';
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isRoiExpired(roiExpiresAt) {
  if (!roiExpiresAt) return true;
  const roiDate = new Date(String(roiExpiresAt));
  if (Number.isNaN(roiDate.getTime())) return true;
  roiDate.setHours(0, 0, 0, 0);
  return roiDate.getTime() < startOfToday().getTime();
}

export function getEffectiveSchoolStaffRoiState(record, roiExpiresAt) {
  if (!record || !toBool(record.is_active)) return 'none';
  const accessLevel = normalizeAccessLevel(record.access_level);
  if (accessLevel === 'packet') return 'packet';
  return isRoiExpired(roiExpiresAt) ? 'expired' : 'roi';
}

function formatUserName(firstName, lastName, email, fallbackId = null) {
  const name = [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ').trim();
  if (name) return name;
  const emailText = String(email || '').trim();
  if (emailText) return emailText;
  return fallbackId ? `User ${fallbackId}` : null;
}

class ClientSchoolStaffRoiAccess {
  static async listSchoolStaffRosterForClient({ clientId, schoolOrganizationId, roiExpiresAt = null }) {
    const cid = Number(clientId || 0);
    const sid = Number(schoolOrganizationId || 0);
    if (!cid || !sid) return [];

    const [rows] = await pool.execute(
      `SELECT
         u.id AS school_staff_user_id,
         u.first_name,
         u.last_name,
         u.email,
         u.status,
         a.id AS access_record_id,
         a.access_level,
         a.is_active,
         a.granted_by_user_id,
         a.granted_at,
         a.revoked_by_user_id,
         a.revoked_at,
         a.last_packet_uploaded_by_user_id,
         a.last_packet_uploaded_at,
         gb.first_name AS granted_by_first_name,
         gb.last_name AS granted_by_last_name,
         gb.email AS granted_by_email,
         rb.first_name AS revoked_by_first_name,
         rb.last_name AS revoked_by_last_name,
         rb.email AS revoked_by_email,
         pu.first_name AS packet_uploader_first_name,
         pu.last_name AS packet_uploader_last_name,
         pu.email AS packet_uploader_email
       FROM user_agencies ua
       JOIN users u
         ON u.id = ua.user_id
       LEFT JOIN client_school_staff_roi_access a
         ON a.client_id = ?
        AND a.school_organization_id = ua.agency_id
        AND a.school_staff_user_id = u.id
       LEFT JOIN users gb ON gb.id = a.granted_by_user_id
       LEFT JOIN users rb ON rb.id = a.revoked_by_user_id
       LEFT JOIN users pu ON pu.id = a.last_packet_uploaded_by_user_id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role, '')) = 'school_staff'
         AND COALESCE(u.is_active, TRUE) = TRUE
         AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
       ORDER BY u.last_name ASC, u.first_name ASC, u.email ASC`,
      [cid, sid]
    );

    return (rows || []).map((row) => {
      const effectiveState = getEffectiveSchoolStaffRoiState(row, roiExpiresAt);
      return {
        school_staff_user_id: Number(row.school_staff_user_id),
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        email: row.email || null,
        status: row.status || null,
        access_record_id: row.access_record_id ? Number(row.access_record_id) : null,
        access_level: row.access_record_id && toBool(row.is_active) ? normalizeAccessLevel(row.access_level) : 'none',
        is_active: toBool(row.is_active),
        effective_access_state: effectiveState,
        can_open_client: effectiveState === 'roi',
        granted_by_user_id: row.granted_by_user_id ? Number(row.granted_by_user_id) : null,
        granted_at: row.granted_at || null,
        granted_by_name: formatUserName(
          row.granted_by_first_name,
          row.granted_by_last_name,
          row.granted_by_email,
          row.granted_by_user_id
        ),
        revoked_by_user_id: row.revoked_by_user_id ? Number(row.revoked_by_user_id) : null,
        revoked_at: row.revoked_at || null,
        revoked_by_name: formatUserName(
          row.revoked_by_first_name,
          row.revoked_by_last_name,
          row.revoked_by_email,
          row.revoked_by_user_id
        ),
        last_packet_uploaded_by_user_id: row.last_packet_uploaded_by_user_id ? Number(row.last_packet_uploaded_by_user_id) : null,
        last_packet_uploaded_at: row.last_packet_uploaded_at || null,
        last_packet_uploaded_by_name: formatUserName(
          row.packet_uploader_first_name,
          row.packet_uploader_last_name,
          row.packet_uploader_email,
          row.last_packet_uploaded_by_user_id
        )
      };
    });
  }

  static async listAccessRecordsForSchoolStaff({ schoolStaffUserId, schoolOrganizationId, clientIds }) {
    const uid = Number(schoolStaffUserId || 0);
    const sid = Number(schoolOrganizationId || 0);
    const ids = Array.isArray(clientIds)
      ? clientIds.map((id) => Number(id)).filter(Boolean)
      : [];
    if (!uid || !sid || ids.length === 0) return new Map();

    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT
         client_id,
         access_level,
         is_active,
         granted_at,
         revoked_at,
         last_packet_uploaded_at
       FROM client_school_staff_roi_access
       WHERE school_staff_user_id = ?
         AND school_organization_id = ?
         AND client_id IN (${placeholders})`,
      [uid, sid, ...ids]
    );

    return new Map((rows || []).map((row) => [
      Number(row.client_id),
      {
        access_level: normalizeAccessLevel(row.access_level),
        is_active: toBool(row.is_active),
        granted_at: row.granted_at || null,
        revoked_at: row.revoked_at || null,
        last_packet_uploaded_at: row.last_packet_uploaded_at || null
      }
    ]));
  }

  static async schoolStaffHasActiveRoiAccess({ clientId, schoolOrganizationId, schoolStaffUserId }) {
    const cid = Number(clientId || 0);
    const sid = Number(schoolOrganizationId || 0);
    const uid = Number(schoolStaffUserId || 0);
    if (!cid || !sid || !uid) return false;

    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_school_staff_roi_access a
       JOIN clients c ON c.id = a.client_id
       WHERE a.client_id = ?
         AND a.school_organization_id = ?
         AND a.school_staff_user_id = ?
         AND a.is_active = TRUE
         AND LOWER(a.access_level) = 'roi'
         AND c.roi_expires_at IS NOT NULL
         AND DATE(c.roi_expires_at) >= CURDATE()
       LIMIT 1`,
      [cid, sid, uid]
    );

    return (rows || []).length > 0;
  }

  static async resetForNewPacket({ clientId, schoolOrganizationId, uploaderUserId, actorUserId = null }) {
    const cid = Number(clientId || 0);
    const sid = Number(schoolOrganizationId || 0);
    const uploaderId = Number(uploaderUserId || 0);
    const actorId = Number(actorUserId || 0) || null;
    if (!cid || !sid || !uploaderId) return false;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE client_school_staff_roi_access
         SET is_active = FALSE,
             revoked_by_user_id = ?,
             revoked_at = CURRENT_TIMESTAMP
         WHERE client_id = ?
           AND school_organization_id = ?
           AND is_active = TRUE`,
        [actorId, cid, sid]
      );

      await connection.execute(
        `INSERT INTO client_school_staff_roi_access
          (client_id, school_organization_id, school_staff_user_id, access_level, is_active,
           granted_by_user_id, granted_at, revoked_by_user_id, revoked_at,
           last_packet_uploaded_by_user_id, last_packet_uploaded_at)
         VALUES (?, ?, ?, 'packet', TRUE, NULL, NULL, NULL, NULL, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           access_level = 'packet',
           is_active = TRUE,
           granted_by_user_id = NULL,
           granted_at = NULL,
           revoked_by_user_id = NULL,
           revoked_at = NULL,
           last_packet_uploaded_by_user_id = VALUES(last_packet_uploaded_by_user_id),
           last_packet_uploaded_at = VALUES(last_packet_uploaded_at),
           updated_at = CURRENT_TIMESTAMP`,
        [cid, sid, uploaderId, uploaderId]
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async setAccessState({
    clientId,
    schoolOrganizationId,
    schoolStaffUserId,
    nextState,
    actorUserId = null
  }) {
    const cid = Number(clientId || 0);
    const sid = Number(schoolOrganizationId || 0);
    const staffId = Number(schoolStaffUserId || 0);
    const actorId = Number(actorUserId || 0) || null;
    const state = String(nextState || '').trim().toLowerCase();
    if (!cid || !sid || !staffId) return false;
    if (!['none', 'packet', 'roi'].includes(state)) {
      throw new Error('Invalid nextState');
    }

    if (state === 'none') {
      await pool.execute(
        `INSERT INTO client_school_staff_roi_access
          (client_id, school_organization_id, school_staff_user_id, access_level, is_active,
           revoked_by_user_id, revoked_at)
         VALUES (?, ?, ?, 'packet', FALSE, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           is_active = FALSE,
           revoked_by_user_id = VALUES(revoked_by_user_id),
           revoked_at = VALUES(revoked_at),
           updated_at = CURRENT_TIMESTAMP`,
        [cid, sid, staffId, actorId]
      );
      return true;
    }

    if (state === 'packet') {
      await pool.execute(
        `INSERT INTO client_school_staff_roi_access
          (client_id, school_organization_id, school_staff_user_id, access_level, is_active,
           revoked_by_user_id, revoked_at)
         VALUES (?, ?, ?, 'packet', TRUE, NULL, NULL)
         ON DUPLICATE KEY UPDATE
           access_level = 'packet',
           is_active = TRUE,
           granted_by_user_id = NULL,
           granted_at = NULL,
           revoked_by_user_id = NULL,
           revoked_at = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        [cid, sid, staffId]
      );
      return true;
    }

    await pool.execute(
      `INSERT INTO client_school_staff_roi_access
        (client_id, school_organization_id, school_staff_user_id, access_level, is_active,
         granted_by_user_id, granted_at, revoked_by_user_id, revoked_at)
       VALUES (?, ?, ?, 'roi', TRUE, ?, CURRENT_TIMESTAMP, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         access_level = 'roi',
         is_active = TRUE,
         granted_by_user_id = VALUES(granted_by_user_id),
         granted_at = VALUES(granted_at),
         revoked_by_user_id = NULL,
         revoked_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [cid, sid, staffId, actorId]
    );
    return true;
  }

  static async revokeForSchoolStaff({
    schoolStaffUserId,
    schoolOrganizationId = null,
    actorUserId = null
  }) {
    const userId = Number(schoolStaffUserId || 0);
    const orgId = schoolOrganizationId === null || schoolOrganizationId === undefined
      ? null
      : Number(schoolOrganizationId || 0);
    const actorId = Number(actorUserId || 0) || null;
    if (!userId) return 0;

    const values = [actorId, userId];
    let whereOrg = '';
    if (orgId) {
      whereOrg = ' AND school_organization_id = ?';
      values.push(orgId);
    }

    const [result] = await pool.execute(
      `UPDATE client_school_staff_roi_access
       SET is_active = FALSE,
           revoked_by_user_id = ?,
           revoked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE school_staff_user_id = ?
         ${whereOrg}`,
      values
    );
    return Number(result?.affectedRows || 0);
  }
}

export default ClientSchoolStaffRoiAccess;
