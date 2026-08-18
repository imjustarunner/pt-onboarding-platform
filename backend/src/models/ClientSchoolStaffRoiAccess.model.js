import pool from '../config/database.js';
import { paperPacketRoiExpiresAtYmd } from '../utils/paperPacketRoiExpiry.js';
import {
  sqlNonEmpty,
  sqlUnicodeEq,
  sqlUnicodeLiteral,
  sqlUnicodeNe
} from '../utils/mysqlCollation.js';

function normalizeAccessLevel(level) {
  const normalized = String(level || '').trim().toLowerCase();
  if (normalized === 'roi_docs') return 'roi_docs';
  if (normalized === 'roi') return 'roi';
  if (normalized === 'limited') return 'limited';
  return 'packet';
}

function toBool(value) {
  return value === true || value === 1 || value === '1';
}

const ROLE_IS_SCHOOL_STAFF = sqlUnicodeLiteral("LOWER(COALESCE(u.role, ''))", 'school_staff');
const STATUS_NOT_ARCHIVED = sqlUnicodeNe("UPPER(COALESCE(u.status, ''))", "'ARCHIVED'");
const EMAIL_MATCH = sqlUnicodeEq(
  "LOWER(TRIM(COALESCE(sc.email, '')))",
  "LOWER(TRIM(COALESCE(u.email, '')))"
);
const WORK_EMAIL_MATCH = sqlUnicodeEq(
  "LOWER(TRIM(COALESCE(sc.email, '')))",
  "LOWER(TRIM(COALESCE(u.work_email, '')))"
);
const FULL_NAME_MATCH = sqlUnicodeEq(
  "LOWER(TRIM(COALESCE(sc.full_name, '')))",
  "LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))))"
);

const SCHOOL_CONTACT_ROLE_TITLE_SUBQUERY = `(
  SELECT sc.role_title
  FROM school_contacts sc
  WHERE sc.school_organization_id = ua.agency_id
    AND (
      (${sqlNonEmpty('u.email')} AND ${EMAIL_MATCH})
      OR (${sqlNonEmpty('u.work_email')} AND ${WORK_EMAIL_MATCH})
      OR (
        ${sqlNonEmpty("CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))")}
        AND ${FULL_NAME_MATCH}
      )
    )
    AND ${sqlNonEmpty('sc.role_title')}
  ORDER BY sc.id DESC
  LIMIT 1
) AS contact_role_title`;

const SCHEDULER_CONTACT_EXISTS = `
             SELECT 1
             FROM school_contacts sc
             WHERE sc.school_organization_id = ua.agency_id
               AND (
                 (${sqlNonEmpty('u.email')} AND ${EMAIL_MATCH})
                 OR (${sqlNonEmpty('u.work_email')} AND ${WORK_EMAIL_MATCH})
               )
               AND COALESCE(sc.is_scheduler, 0) = 1`;

function isSchoolContactsSchedulerFilterError(error) {
  const code = String(error?.code || '').trim();
  if (code === 'ER_BAD_FIELD_ERROR' || code === 'ER_NO_SUCH_TABLE') return true;
  const msg = String(error?.message || '').toLowerCase();
  if (!msg) return false;
  // Be defensive across environments: collation and legacy schema differences can
  // break the scheduler exclusion subquery, but we can safely fall back.
  return (
    msg.includes('school_contacts')
    || msg.includes('is_scheduler')
    || msg.includes('collation')
  );
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

export function getEffectiveSchoolStaffRoiState(record, roiExpiresAt, { schoolStaffInOrg = false } = {}) {
  const expired = isRoiExpired(roiExpiresAt);
  if (!record || !toBool(record.is_active)) {
    if (schoolStaffInOrg && !expired) return 'limited';
    return 'none';
  }
  const accessLevel = normalizeAccessLevel(record.access_level);
  // Legacy "No ROI on file" (packet) upgrades to ROI Active when the client ROI date is current.
  if (accessLevel === 'packet') {
    if (!expired) return 'limited';
    return 'packet';
  }
  if (expired) return 'expired';
  if (accessLevel === 'limited') return 'limited';
  return accessLevel === 'roi_docs' ? 'roi_docs' : 'roi';
}

/**
 * ROI Active (limited), ROI (Speak), ROI All Active, and expired ROI may open
 * the client for schedule / comments / own document uploads.
 * Packet / no-ROI staff stay locked. Referral documents remain gated by
 * schoolStaffCanViewClientDocuments.
 */
export function schoolStaffCanOpenClient(record, roiExpiresAt, opts = {}) {
  const effectiveState = getEffectiveSchoolStaffRoiState(record, roiExpiresAt, opts);
  return (
    effectiveState === 'limited'
    || effectiveState === 'roi'
    || effectiveState === 'roi_docs'
    || effectiveState === 'expired'
  );
}

export function schoolStaffCanViewClientDocuments(record, roiExpiresAt, opts = {}) {
  return getEffectiveSchoolStaffRoiState(record, roiExpiresAt, opts) === 'roi_docs';
}

function formatUserName(firstName, lastName, email, fallbackId = null) {
  const name = [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ').trim();
  if (name) return name;
  const emailText = String(email || '').trim();
  if (emailText) return emailText;
  return fallbackId ? `User ${fallbackId}` : null;
}

class ClientSchoolStaffRoiAccess {
  static async schoolStaffBelongsToOrganization({ schoolStaffUserId, schoolOrganizationId }) {
    const uid = Number(schoolStaffUserId || 0);
    const sid = Number(schoolOrganizationId || 0);
    if (!uid || !sid) return false;

    const [rows] = await pool.execute(
      `SELECT 1
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       WHERE ua.user_id = ?
         AND ua.agency_id = ?
         AND ${ROLE_IS_SCHOOL_STAFF}
         AND COALESCE(u.is_active, TRUE) = TRUE
         AND ${STATUS_NOT_ARCHIVED}
       LIMIT 1`,
      [uid, sid]
    );
    return (rows || []).length > 0;
  }

  static async listSchoolStaffRosterForOrganization({ schoolOrganizationId }) {
    const sid = Number(schoolOrganizationId || 0);
    if (!sid) return [];

    let rows = [];
    try {
      const [result] = await pool.execute(
        `SELECT
           u.id AS school_staff_user_id,
           u.first_name,
           u.last_name,
           u.email,
           u.phone_number,
           u.work_phone,
           u.personal_phone,
           u.title,
           u.role AS role_key,
           u.status,
           ${SCHOOL_CONTACT_ROLE_TITLE_SUBQUERY}
         FROM user_agencies ua
         JOIN users u
           ON u.id = ua.user_id
         WHERE ua.agency_id = ?
           AND ${ROLE_IS_SCHOOL_STAFF}
           AND COALESCE(u.is_active, TRUE) = TRUE
           AND ${STATUS_NOT_ARCHIVED}
           AND NOT EXISTS (
             ${SCHEDULER_CONTACT_EXISTS}
           )
         ORDER BY u.last_name ASC, u.first_name ASC, u.email ASC`,
        [sid]
      );
      rows = Array.isArray(result) ? result : [];
    } catch (e) {
      if (!isSchoolContactsSchedulerFilterError(e)) throw e;
      const [result] = await pool.execute(
        `SELECT
           u.id AS school_staff_user_id,
           u.first_name,
           u.last_name,
           u.email,
           u.phone_number,
           u.work_phone,
           u.personal_phone,
           u.title,
           u.role AS role_key,
           u.status,
           NULL AS contact_role_title
         FROM user_agencies ua
         JOIN users u
           ON u.id = ua.user_id
         WHERE ua.agency_id = ?
           AND ${ROLE_IS_SCHOOL_STAFF}
           AND COALESCE(u.is_active, TRUE) = TRUE
           AND ${STATUS_NOT_ARCHIVED}
         ORDER BY u.last_name ASC, u.first_name ASC, u.email ASC`,
        [sid]
      );
      rows = Array.isArray(result) ? result : [];
    }

    return (rows || []).map((row) => ({
      school_staff_user_id: Number(row.school_staff_user_id),
      first_name: row.first_name || null,
      last_name: row.last_name || null,
      email: row.email || null,
      phone_number: String(row.phone_number || row.work_phone || row.personal_phone || '').trim() || null,
      role_key: row.role_key || 'school_staff',
      role_title: String(row.contact_role_title || row.title || '').trim() || null,
      status: row.status || null
    }));
  }

  static async listSchoolStaffRosterForClient({ clientId, schoolOrganizationId, roiExpiresAt = null }) {
    const cid = Number(clientId || 0);
    const sid = Number(schoolOrganizationId || 0);
    if (!cid || !sid) return [];

    let rows = [];
    try {
      const [result] = await pool.execute(
        `SELECT
           u.id AS school_staff_user_id,
           u.first_name,
           u.last_name,
           u.email,
           u.phone_number,
           u.work_phone,
           u.personal_phone,
           u.title,
           u.role AS role_key,
           u.status,
           ${SCHOOL_CONTACT_ROLE_TITLE_SUBQUERY},
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
           AND ${ROLE_IS_SCHOOL_STAFF}
           AND COALESCE(u.is_active, TRUE) = TRUE
           AND ${STATUS_NOT_ARCHIVED}
           AND NOT EXISTS (
             ${SCHEDULER_CONTACT_EXISTS}
           )
         ORDER BY u.last_name ASC, u.first_name ASC, u.email ASC`,
        [cid, sid]
      );
      rows = Array.isArray(result) ? result : [];
    } catch (e) {
      if (!isSchoolContactsSchedulerFilterError(e)) throw e;
      const [result] = await pool.execute(
        `SELECT
           u.id AS school_staff_user_id,
           u.first_name,
           u.last_name,
           u.email,
           u.phone_number,
           u.work_phone,
           u.personal_phone,
           u.title,
           u.role AS role_key,
           u.status,
           NULL AS contact_role_title,
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
           AND ${ROLE_IS_SCHOOL_STAFF}
           AND COALESCE(u.is_active, TRUE) = TRUE
           AND ${STATUS_NOT_ARCHIVED}
         ORDER BY u.last_name ASC, u.first_name ASC, u.email ASC`,
        [cid, sid]
      );
      rows = Array.isArray(result) ? result : [];
    }

    return (rows || []).map((row) => {
      const effectiveState = getEffectiveSchoolStaffRoiState(row, roiExpiresAt, { schoolStaffInOrg: true });
      return {
        school_staff_user_id: Number(row.school_staff_user_id),
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        email: row.email || null,
        phone_number: String(row.phone_number || row.work_phone || row.personal_phone || '').trim() || null,
        role_key: row.role_key || 'school_staff',
        role_title: String(row.contact_role_title || row.title || '').trim() || null,
        status: row.status || null,
        access_record_id: row.access_record_id ? Number(row.access_record_id) : null,
        access_level: row.access_record_id && toBool(row.is_active)
          ? normalizeAccessLevel(row.access_level)
          : 'none',
        is_active: toBool(row.is_active),
        effective_access_state: effectiveState,
        can_open_client: schoolStaffCanOpenClient(row, roiExpiresAt, { schoolStaffInOrg: true }),
        can_view_documents: schoolStaffCanViewClientDocuments(row, roiExpiresAt, { schoolStaffInOrg: true }),
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

  static async schoolStaffHasActiveRoiAccess({
    clientId,
    schoolOrganizationId,
    schoolStaffUserId,
    requireDocumentAccess = false,
    includeLimited = true
  }) {
    const state = await this.resolveSchoolStaffClientAccessState({
      clientId,
      schoolOrganizationId,
      schoolStaffUserId
    });
    if (requireDocumentAccess) return state === 'roi_docs';
    // Expired still allows schedule/comments/tickets; docs remain blocked above.
    // includeLimited is kept for callers; limited is ROI Active (portal except referral docs).
    if (includeLimited) {
      return state === 'limited' || state === 'roi' || state === 'roi_docs' || state === 'expired';
    }
    return state === 'roi' || state === 'roi_docs' || state === 'expired';
  }

  static async resolveSchoolStaffClientAccessState({
    clientId,
    schoolOrganizationId,
    schoolStaffUserId
  }) {
    const cid = Number(clientId || 0);
    const sid = Number(schoolOrganizationId || 0);
    const uid = Number(schoolStaffUserId || 0);
    if (!cid || !sid || !uid) return 'none';

    const [rows] = await pool.execute(
      `SELECT
         a.access_level,
         a.is_active,
         c.roi_expires_at
       FROM client_school_staff_roi_access a
       JOIN clients c ON c.id = a.client_id
       WHERE a.client_id = ?
         AND a.school_organization_id = ?
         AND a.school_staff_user_id = ?
       LIMIT 1`,
      [cid, sid, uid]
    );
    const row = rows?.[0] || null;
    if (row) {
      return getEffectiveSchoolStaffRoiState(row, row.roi_expires_at || null, { schoolStaffInOrg: true });
    }

    const inOrg = await this.schoolStaffBelongsToOrganization({
      schoolStaffUserId: uid,
      schoolOrganizationId: sid
    });
    if (!inOrg) return 'none';
    const [clientRows] = await pool.execute(
      `SELECT roi_expires_at FROM clients WHERE id = ? LIMIT 1`,
      [cid]
    );
    const roiExpiresAt = clientRows?.[0]?.roi_expires_at || null;
    if (!isRoiExpired(roiExpiresAt)) return 'limited';
    return 'none';
  }

  /**
   * Paper packet upload defaults:
   * - School-staff uploader → limited / ROI Active (open client; own uploads only)
   * - Other school staff → no grant
   * - Set clients.roi_expires_at using paper-packet rules (1y before 2026-08-09, else 3y)
   * - Flag client for school-admin / general staff to configure per-staff ROI from paper form
   */
  static async resetForNewPacket({
    clientId,
    schoolOrganizationId,
    uploaderUserId = null,
    actorUserId = null,
    packetDate = null
  }) {
    const cid = Number(clientId || 0);
    const sid = Number(schoolOrganizationId || 0);
    const uploaderId = Number(uploaderUserId || 0) || null;
    const actorId = Number(actorUserId || 0) || null;
    if (!cid || !sid) return false;

    const roiExpiresYmd = paperPacketRoiExpiresAtYmd(packetDate || new Date());

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Clear prior active grants for this client/school, then grant uploader only.
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

      if (uploaderId) {
        const uploaderIsSchoolStaff = await this.schoolStaffBelongsToOrganization({
          schoolStaffUserId: uploaderId,
          schoolOrganizationId: sid
        });
        if (uploaderIsSchoolStaff) {
          await connection.execute(
            `INSERT INTO client_school_staff_roi_access
              (client_id, school_organization_id, school_staff_user_id, access_level, is_active,
               granted_by_user_id, granted_at, revoked_by_user_id, revoked_at,
               last_packet_uploaded_by_user_id, last_packet_uploaded_at)
             VALUES (?, ?, ?, 'limited', TRUE, ?, CURRENT_TIMESTAMP, NULL, NULL, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
               access_level = 'limited',
               is_active = TRUE,
               granted_by_user_id = VALUES(granted_by_user_id),
               granted_at = VALUES(granted_at),
               revoked_by_user_id = NULL,
               revoked_at = NULL,
               last_packet_uploaded_by_user_id = VALUES(last_packet_uploaded_by_user_id),
               last_packet_uploaded_at = VALUES(last_packet_uploaded_at),
               updated_at = CURRENT_TIMESTAMP`,
            [cid, sid, uploaderId, actorId, uploaderId]
          );
        }
      }

      await connection.execute(
        `UPDATE clients
         SET roi_expires_at = ?,
             paper_packet_staff_roi_pending = 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [roiExpiresYmd, cid]
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
    const rawState = String(nextState || '').trim().toLowerCase();
    let state = rawState;
    if (state === 'none') state = 'packet';
    if (!cid || !sid || !staffId) return false;
    if (!['packet', 'limited', 'roi', 'roi_docs'].includes(state)) {
      throw new Error('Invalid nextState');
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
       VALUES (?, ?, ?, ?, TRUE, ?, CURRENT_TIMESTAMP, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         access_level = VALUES(access_level),
         is_active = TRUE,
         granted_by_user_id = VALUES(granted_by_user_id),
         granted_at = VALUES(granted_at),
         revoked_by_user_id = NULL,
         revoked_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [cid, sid, staffId, state, actorId]
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
