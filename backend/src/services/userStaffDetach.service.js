/**
 * Remove a user from one organization (user_agencies row) and run operational cleanup
 * as admin "remove from agency": school days/slots, client assignments, and — when
 * removing a parent tenant — affiliated school memberships that exist only under that tenant.
 */

import { adjustProviderSlots } from './providerSlots.service.js';

function ignoreIfMissing(e) {
  const msg = String(e?.message || '');
  return (
    msg.includes('ER_NO_SUCH_TABLE') ||
    msg.includes("doesn't exist") ||
    msg.includes('Unknown column') ||
    msg.includes('ER_BAD_FIELD_ERROR')
  );
}

async function execOptional(conn, sql, params) {
  try {
    await conn.execute(sql, params);
  } catch (e) {
    if (!ignoreIfMissing(e)) throw e;
  }
}

function isSchoolLikeOrgType(orgType) {
  return ['school', 'program', 'learning'].includes(String(orgType || '').toLowerCase());
}

async function listAffiliatedOrgIds(conn, agencyId) {
  const ids = new Set();
  try {
    const [rows] = await conn.execute(
      `SELECT organization_id AS id
       FROM organization_affiliations
       WHERE agency_id = ? AND is_active = TRUE`,
      [agencyId]
    );
    for (const r of rows || []) {
      const id = Number(r.id);
      if (id && id !== agencyId) ids.add(id);
    }
  } catch (e) {
    if (!ignoreIfMissing(e)) throw e;
  }
  try {
    const [rows] = await conn.execute(
      `SELECT school_organization_id AS id
       FROM agency_schools
       WHERE agency_id = ? AND is_active = TRUE`,
      [agencyId]
    );
    for (const r of rows || []) {
      const id = Number(r.id);
      if (id && id !== agencyId) ids.add(id);
    }
  } catch (e) {
    if (!ignoreIfMissing(e)) throw e;
  }
  return [...ids];
}

async function userHasOtherParentForOrg(conn, { userId, orgId, exceptAgencyId }) {
  try {
    const [rows] = await conn.execute(
      `SELECT 1
       FROM organization_affiliations oa
       INNER JOIN user_agencies ua
         ON ua.agency_id = oa.agency_id AND ua.user_id = ?
       WHERE oa.organization_id = ?
         AND oa.is_active = TRUE
         AND oa.agency_id <> ?
       LIMIT 1`,
      [userId, orgId, exceptAgencyId]
    );
    if (rows?.length) return true;
  } catch (e) {
    if (!ignoreIfMissing(e)) throw e;
  }
  try {
    const [rows] = await conn.execute(
      `SELECT 1
       FROM agency_schools asx
       INNER JOIN user_agencies ua
         ON ua.agency_id = asx.agency_id AND ua.user_id = ?
       WHERE asx.school_organization_id = ?
         AND asx.is_active = TRUE
         AND asx.agency_id <> ?
       LIMIT 1`,
      [userId, orgId, exceptAgencyId]
    );
    return !!(rows?.length);
  } catch (e) {
    if (!ignoreIfMissing(e)) throw e;
  }
  return false;
}

async function detachUserFromSchoolLikeOrg(conn, { userId, schoolId, actorUserId }) {
  const uid = parseInt(userId, 10);
  const sid = parseInt(schoolId, 10);
  const actor = parseInt(actorUserId, 10) || null;
  if (!uid || !sid) return;

  try {
    const [assignRows] = await conn.execute(
      `SELECT id, client_id, service_day
       FROM client_provider_assignments
       WHERE provider_user_id = ? AND organization_id = ? AND is_active = TRUE
       FOR UPDATE`,
      [uid, sid]
    );

    for (const a of assignRows || []) {
      if (a?.service_day) {
        await adjustProviderSlots(conn, {
          providerUserId: uid,
          schoolId: sid,
          dayOfWeek: a.service_day,
          delta: +1
        });
      }

      await conn.execute(
        `UPDATE client_provider_assignments
         SET is_active = FALSE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [actor, a.id]
      );

      let next = null;
      try {
        const [nextRows] = await conn.execute(
          `SELECT provider_user_id, service_day
           FROM client_provider_assignments
           WHERE client_id = ? AND is_active = TRUE
           ORDER BY (CASE WHEN is_primary = TRUE THEN 1 ELSE 0 END) DESC, updated_at DESC
           LIMIT 1`,
          [a.client_id]
        );
        next = nextRows?.[0] || null;
      } catch (e) {
        const msg = String(e?.message || '');
        const missingIsPrimary = msg.includes('Unknown column') && msg.includes('is_primary');
        if (!missingIsPrimary) throw e;
        const [nextRows] = await conn.execute(
          `SELECT provider_user_id, service_day
           FROM client_provider_assignments
           WHERE client_id = ? AND is_active = TRUE
           ORDER BY updated_at DESC
           LIMIT 1`,
          [a.client_id]
        );
        next = nextRows?.[0] || null;
      }

      try {
        await conn.execute(
          `UPDATE clients
           SET provider_id = ?, service_day = ?, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [next?.provider_user_id || null, next?.service_day || null, actor, a.client_id]
        );
      } catch {
        // best-effort
      }
    }
  } catch (e) {
    if (!ignoreIfMissing(e)) throw e;

    try {
      const [rows] = await conn.execute(
        `SELECT id, service_day
         FROM clients
         WHERE organization_id = ? AND provider_id = ?`,
        [sid, uid]
      );
      for (const r of rows || []) {
        if (r?.service_day) {
          await adjustProviderSlots(conn, {
            providerUserId: uid,
            schoolId: sid,
            dayOfWeek: r.service_day,
            delta: +1
          });
        }
      }
      await conn.execute(
        `UPDATE clients
         SET provider_id = NULL, service_day = NULL, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND provider_id = ?`,
        [actor, sid, uid]
      );
    } catch (e2) {
      if (!ignoreIfMissing(e2)) throw e2;
    }
  }

  await execOptional(
    conn,
    `UPDATE provider_school_assignments
     SET is_active = FALSE
     WHERE provider_user_id = ? AND school_organization_id = ?`,
    [uid, sid]
  );
  await execOptional(
    conn,
    `UPDATE school_day_provider_assignments
     SET is_active = FALSE
     WHERE provider_user_id = ? AND school_organization_id = ?`,
    [uid, sid]
  );
  await execOptional(
    conn,
    `DELETE FROM soft_schedule_slots
     WHERE provider_user_id = ? AND school_organization_id = ?`,
    [uid, sid]
  );
  await execOptional(
    conn,
    `DELETE FROM school_provider_schedule_entries
     WHERE provider_user_id = ? AND school_organization_id = ?`,
    [uid, sid]
  );
  await execOptional(
    conn,
    'DELETE FROM provider_school_portal_access WHERE provider_user_id = ? AND school_organization_id = ?',
    [uid, sid]
  );
}

async function detachAgencyScopedLinks(conn, { userId, agencyId }) {
  const uid = parseInt(userId, 10);
  const aid = parseInt(agencyId, 10);
  if (!uid || !aid) return;

  await execOptional(
    conn,
    'DELETE FROM supervisor_assignments WHERE agency_id = ? AND (supervisor_id = ? OR supervisee_id = ?)',
    [aid, uid, uid]
  );
  await execOptional(
    conn,
    'DELETE FROM agency_management_team WHERE agency_id = ? AND user_id = ?',
    [aid, uid]
  );
  await execOptional(
    conn,
    `UPDATE user_office_locations uol
     INNER JOIN office_location_agencies ola ON ola.office_location_id = uol.office_location_id
     SET uol.is_active = FALSE
     WHERE uol.user_id = ? AND ola.agency_id = ?`,
    [uid, aid]
  );
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ userId: number, agencyId: number, actorUserId: number }} params
 */
export async function detachUserFromOrganization(conn, { userId, agencyId, actorUserId }) {
  const uid = parseInt(userId, 10);
  const aid = parseInt(agencyId, 10);
  const actor = parseInt(actorUserId, 10) || null;

  const [[orgRow]] = await conn.execute(
    `SELECT organization_type
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [aid]
  );
  const orgType = String(orgRow?.organization_type || 'agency').toLowerCase();
  const isSchoolLike = isSchoolLikeOrgType(orgType);

  if (!isSchoolLike) {
    const affiliatedIds = await listAffiliatedOrgIds(conn, aid);
    for (const schoolId of affiliatedIds) {
      const keepForOtherTenant = await userHasOtherParentForOrg(conn, {
        userId: uid,
        orgId: schoolId,
        exceptAgencyId: aid
      });
      if (keepForOtherTenant) continue;
      await detachUserFromSchoolLikeOrg(conn, { userId: uid, schoolId, actorUserId: actor });
      await conn.execute('DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?', [uid, schoolId]);
    }
  } else {
    await detachUserFromSchoolLikeOrg(conn, { userId: uid, schoolId: aid, actorUserId: actor });
  }

  await detachAgencyScopedLinks(conn, { userId: uid, agencyId: aid });
  await conn.execute('DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?', [uid, aid]);
}

/**
 * After all user_agencies rows are removed, clear cross-cutting provider/supervisor links.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} userId
 */
export async function detachUserGlobalLinks(conn, userId) {
  const uid = parseInt(userId, 10);
  if (!uid) return;

  await execOptional(
    conn,
    'DELETE FROM supervisor_assignments WHERE supervisor_id = ? OR supervisee_id = ?',
    [uid, uid]
  );
  await execOptional(conn, 'DELETE FROM provider_school_portal_access WHERE provider_user_id = ?', [uid]);
  await execOptional(conn, 'DELETE FROM agency_management_team WHERE user_id = ?', [uid]);
  await execOptional(conn, 'DELETE FROM skills_group_providers WHERE provider_user_id = ?', [uid]);
  await execOptional(conn, 'DELETE FROM learning_class_provider_memberships WHERE provider_user_id = ?', [uid]);
  await execOptional(conn, 'DELETE FROM provider_school_profiles WHERE provider_user_id = ?', [uid]);
  try {
    const { detachUserFromMeetingInvites } = await import('./meetingInviteGroupSync.service.js');
    await detachUserFromMeetingInvites(uid);
  } catch {
    /* optional until migration */
  }
}
