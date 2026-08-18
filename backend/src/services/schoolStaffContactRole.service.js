import pool from '../config/database.js';
import User from '../models/User.model.js';

export function normalizeSchoolStaffContactEmail(value) {
  const out = String(value || '').trim().toLowerCase();
  return out.includes('@') ? out : '';
}

/**
 * Upsert school_contacts.role_title (and optional flags) for a school staff member.
 */
export async function upsertSchoolContactRoleFlags({
  orgId,
  email,
  fullName = null,
  isSchoolAdmin,
  isScheduler,
  roleTitle = undefined
}) {
  const normalized = normalizeSchoolStaffContactEmail(email);
  const schoolOrgId = Number(orgId || 0);
  if (!normalized || !schoolOrgId) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existingRows] = await conn.execute(
      `SELECT id, is_primary, is_school_admin, is_scheduler
       FROM school_contacts
       WHERE school_organization_id = ? AND LOWER(TRIM(email)) = ?
       LIMIT 1`,
      [schoolOrgId, normalized]
    );
    const normalizedRoleTitle = roleTitle !== undefined
      ? (String(roleTitle || '').trim() || null)
      : undefined;

    if (existingRows?.length) {
      const row = existingRows[0];
      const updates = [];
      const values = [];
      if (fullName !== null) {
        updates.push('full_name = ?');
        values.push(fullName || null);
      }
      if (typeof isSchoolAdmin === 'boolean') {
        updates.push('is_school_admin = ?');
        values.push(isSchoolAdmin ? 1 : 0);
      }
      if (typeof isScheduler === 'boolean') {
        updates.push('is_scheduler = ?');
        values.push(isScheduler ? 1 : 0);
      }
      if (normalizedRoleTitle !== undefined) {
        updates.push('role_title = ?');
        values.push(normalizedRoleTitle);
      }
      if (updates.length) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(row.id, schoolOrgId);
        await conn.execute(
          `UPDATE school_contacts SET ${updates.join(', ')} WHERE id = ? AND school_organization_id = ?`,
          values
        );
      }
    } else {
      await conn.execute(
        `INSERT INTO school_contacts
          (school_organization_id, full_name, email, role_title, notes, is_primary, is_school_admin, is_scheduler)
         VALUES (?, ?, ?, ?, NULL, 0, ?, ?)`,
        [
          schoolOrgId,
          fullName || null,
          normalized,
          normalizedRoleTitle !== undefined ? normalizedRoleTitle : null,
          typeof isSchoolAdmin === 'boolean' && isSchoolAdmin ? 1 : 0,
          typeof isScheduler === 'boolean' && isScheduler ? 1 : 0
        ]
      );
    }
    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch {}
    const code = String(err?.code || '');
    const msg = String(err?.message || '');
    const missing =
      code === 'ER_NO_SUCH_TABLE' ||
      code === 'ER_BAD_FIELD_ERROR' ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column');
    if (missing) return;
    throw err;
  } finally {
    conn.release();
  }
}

export async function syncSchoolStaffUserTitle(userId, roleTitle) {
  const uid = Number(userId || 0);
  if (!uid) return;
  const normalized = roleTitle !== undefined ? (String(roleTitle || '').trim() || null) : undefined;
  if (normalized === undefined) return;
  try {
    await User.update(uid, { title: normalized });
  } catch {
    // best-effort
  }
}

/**
 * Set Role/Title for school staff at a school: school_contacts.role_title + users.title.
 */
export async function setSchoolStaffRoleTitleForOrg({
  schoolOrganizationId,
  userId,
  roleTitle
}) {
  const orgId = Number(schoolOrganizationId || 0);
  const uid = Number(userId || 0);
  if (!orgId || !uid) {
    const err = new Error('Invalid schoolOrganizationId or userId');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(uid);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  if (String(user.role || '').toLowerCase() !== 'school_staff') {
    const err = new Error('Only school_staff users can receive a school Role/Title');
    err.statusCode = 400;
    throw err;
  }

  const membership = await User.getAgencyMembership(uid, orgId);
  if (!membership) {
    const err = new Error('User is not assigned to this school');
    err.statusCode = 400;
    throw err;
  }

  const normalizedTitle = String(roleTitle || '').trim();
  const email = normalizeSchoolStaffContactEmail(user.email || user.work_email || user.username);
  if (!email) {
    const err = new Error('User has no email for school contact linkage');
    err.statusCode = 400;
    throw err;
  }

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || null;
  await upsertSchoolContactRoleFlags({
    orgId,
    email,
    fullName,
    roleTitle: normalizedTitle
  });
  await syncSchoolStaffUserTitle(uid, normalizedTitle);

  return {
    schoolOrganizationId: orgId,
    userId: uid,
    roleTitle: normalizedTitle || null
  };
}

export async function resolveSchoolStaffRoleTitleForUser(user) {
  const role = String(user?.role || '').toLowerCase();
  if (role !== 'school_staff') return String(user?.title || '').trim() || null;

  const fromUser = String(user?.title || '').trim();
  if (fromUser) return fromUser;

  const userId = Number(user?.id || 0);
  if (!userId) return null;

  const emails = new Set();
  for (const raw of [user.email, user.work_email, user.username, user.personal_email]) {
    const n = normalizeSchoolStaffContactEmail(raw);
    if (n) emails.add(n);
  }
  if (!emails.size) return null;

  const placeholders = [...emails].map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT sc.role_title
       FROM school_contacts sc
       INNER JOIN user_agencies ua ON ua.agency_id = sc.school_organization_id AND ua.user_id = ?
       WHERE LOWER(TRIM(COALESCE(sc.email, ''))) IN (${placeholders})
         AND COALESCE(sc.role_title, '') <> ''
       ORDER BY sc.updated_at DESC, sc.id DESC
       LIMIT 1`,
      [userId, ...emails]
    );
    return String(rows?.[0]?.role_title || '').trim() || null;
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE' || err?.code === 'ER_BAD_FIELD_ERROR') return null;
    throw err;
  }
}
