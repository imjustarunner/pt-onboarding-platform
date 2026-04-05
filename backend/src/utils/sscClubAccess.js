import pool from '../config/database.js';

let userAgencyColumnSupportPromise = null;

const MANAGER_ROLES = new Set(['manager', 'assistant_manager']);
const OWNER_ROLES = new Set(['manager']);

const normalizeRole = (value) => String(value || '').trim().toLowerCase();

export const normalizeClubRole = (value, fallback = 'member') => {
  const role = normalizeRole(value);
  if (role === 'manager' || role === 'assistant_manager' || role === 'member') return role;
  return fallback;
};

export const inferLegacyClubRole = (userRole) => {
  const role = normalizeRole(userRole);
  if (role === 'super_admin' || role === 'admin' || role === 'support') return 'manager';
  if (role === 'provider_plus' || role === 'clinical_practice_assistant' || role === 'staff') return 'assistant_manager';
  return 'member';
};

const getUserAgencyColumnSupport = async () => {
  if (!userAgencyColumnSupportPromise) {
    userAgencyColumnSupportPromise = pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'user_agencies'
         AND COLUMN_NAME IN ('club_role', 'is_active')`
    )
      .then(([rows]) => {
        const set = new Set((rows || []).map((row) => row.COLUMN_NAME));
        return {
          hasClubRole: set.has('club_role'),
          hasIsActive: set.has('is_active')
        };
      })
      .catch(() => ({
        hasClubRole: false,
        hasIsActive: false
      }));
  }
  return userAgencyColumnSupportPromise;
};

const toMembership = (row, fallbackRole = null) => {
  if (!row) return null;
  const clubRole = normalizeClubRole(row.club_role, normalizeClubRole(fallbackRole || inferLegacyClubRole(row.user_role || row.role)));
  return {
    ...row,
    club_role: clubRole,
    is_active: row.is_active === undefined ? true : (row.is_active === 1 || row.is_active === true || String(row.is_active) === '1')
  };
};

export const isManagerClubRole = (clubRole, { allowAssistant = true } = {}) => {
  const role = normalizeClubRole(clubRole);
  return allowAssistant ? MANAGER_ROLES.has(role) : OWNER_ROLES.has(role);
};

export const getUserClubMembership = async (userId, clubId) => {
  const uid = Number(userId || 0);
  const cid = Number(clubId || 0);
  if (!uid || !cid) return null;
  const { hasClubRole, hasIsActive } = await getUserAgencyColumnSupport();
  const [rows] = await pool.execute(
    `SELECT ua.user_id,
            ua.agency_id,
            ${hasClubRole ? 'ua.club_role' : 'NULL AS club_role'},
            ${hasIsActive ? 'ua.is_active' : '1 AS is_active'},
            ua.created_at,
            a.name AS club_name,
            a.slug AS club_slug,
            a.organization_type,
            u.role AS user_role
     FROM user_agencies ua
     INNER JOIN agencies a ON a.id = ua.agency_id
     INNER JOIN users u ON u.id = ua.user_id
     WHERE ua.user_id = ?
       AND ua.agency_id = ?
       AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'
     LIMIT 1`,
    [uid, cid]
  );
  return toMembership(rows?.[0] || null);
};

export const canUserManageClub = async ({ user, clubId, allowAssistant = true }) => {
  const uid = Number(user?.id || 0);
  const cid = Number(clubId || 0);
  if (!uid || !cid) return false;
  if (normalizeRole(user?.role) === 'super_admin') return true;
  const membership = await getUserClubMembership(uid, cid);
  if (!membership || membership.is_active === false) return false;
  return isManagerClubRole(membership.club_role, { allowAssistant });
};

export const canUserManageChallengeClass = async ({ user, learningClassId, allowAssistant = true }) => {
  const classId = Number(learningClassId || 0);
  if (!classId || !user?.id) return false;
  if (normalizeRole(user?.role) === 'super_admin') return true;
  const [rows] = await pool.execute(
    `SELECT agency_id
     FROM learning_program_classes
     WHERE id = ?
     LIMIT 1`,
    [classId]
  );
  const clubId = Number(rows?.[0]?.agency_id || 0);
  if (!clubId) return false;
  return canUserManageClub({ user, clubId, allowAssistant });
};

export const getManagedClubsForUser = async (userId, { includeAssistant = true } = {}) => {
  const uid = Number(userId || 0);
  if (!uid) return [];
  const { hasClubRole, hasIsActive } = await getUserAgencyColumnSupport();
  const [rows] = await pool.execute(
    `SELECT a.id,
            a.name,
            a.slug,
            a.city,
            a.state,
            ${hasClubRole ? 'ua.club_role' : 'NULL AS club_role'},
            ${hasIsActive ? 'ua.is_active' : '1 AS is_active'}
     FROM user_agencies ua
     INNER JOIN agencies a ON a.id = ua.agency_id
     INNER JOIN users u ON u.id = ua.user_id
     WHERE ua.user_id = ?
       AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'`,
    [uid]
  );
  return (rows || [])
    .map((row) => toMembership(row))
    .filter((row) => row && row.is_active !== false)
    .filter((row) => isManagerClubRole(row.club_role, { allowAssistant: includeAssistant }));
};

export const getPrimaryClubManager = async (clubId) => {
  const cid = Number(clubId || 0);
  if (!cid) return null;
  const { hasClubRole, hasIsActive } = await getUserAgencyColumnSupport();
  const [rows] = await pool.execute(
    `SELECT u.id,
            u.first_name,
            u.last_name,
            u.email,
            ${hasClubRole ? 'ua.club_role' : 'NULL AS club_role'},
            ${hasIsActive ? 'ua.is_active' : '1 AS is_active'},
            ua.created_at,
            u.role AS user_role
     FROM user_agencies ua
     INNER JOIN users u ON u.id = ua.user_id
     INNER JOIN agencies a ON a.id = ua.agency_id
     WHERE ua.agency_id = ?
       AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'
     ORDER BY
       CASE
         WHEN ${hasClubRole ? "ua.club_role = 'manager'" : "LOWER(COALESCE(u.role, '')) IN ('super_admin','admin','support')"} THEN 0
         WHEN ${hasClubRole ? "ua.club_role = 'assistant_manager'" : "LOWER(COALESCE(u.role, '')) IN ('provider_plus','clinical_practice_assistant','staff')"} THEN 1
         ELSE 2
       END,
       COALESCE(${hasIsActive ? 'ua.is_active' : '1'}, 1) DESC,
       ua.created_at ASC,
       u.id ASC`,
    [cid]
  );

  const row = (rows || [])
    .map((entry) => toMembership(entry))
    .find((entry) => entry && entry.is_active !== false && isManagerClubRole(entry.club_role));

  if (!row) return null;
  const displayName = `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim() || String(row.email || '').trim();
  return {
    userId: Number(row.id),
    clubRole: row.club_role,
    displayName: displayName || 'Club manager',
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    email: row.email || null
  };
};

export const formatClubManagerDisplayName = (manager) => {
  if (!manager) return '';
  const name = `${String(manager.firstName || manager.first_name || '').trim()} ${String(manager.lastName || manager.last_name || '').trim()}`.trim();
  return name || String(manager.displayName || manager.email || '').trim();
};
