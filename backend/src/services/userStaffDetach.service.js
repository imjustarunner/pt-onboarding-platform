/**
 * Remove a user from one organization (user_agencies row) and run the same operational cleanup
 * as admin "remove from agency", including school portal schedules and client provider assignments.
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
  const isSchoolLike = ['school', 'program', 'learning'].includes(orgType);

  await conn.execute('DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?', [uid, aid]);

  if (isSchoolLike) {
    try {
      const [assignRows] = await conn.execute(
        `SELECT id, client_id, service_day
         FROM client_provider_assignments
         WHERE provider_user_id = ? AND organization_id = ? AND is_active = TRUE
         FOR UPDATE`,
        [uid, aid]
      );

      for (const a of assignRows || []) {
        if (a?.service_day) {
          await adjustProviderSlots(conn, {
            providerUserId: uid,
            schoolId: aid,
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
          [aid, uid]
        );
        for (const r of rows || []) {
          if (r?.service_day) {
            await adjustProviderSlots(conn, {
              providerUserId: uid,
              schoolId: aid,
              dayOfWeek: r.service_day,
              delta: +1
            });
          }
        }
        await conn.execute(
          `UPDATE clients
           SET provider_id = NULL, service_day = NULL, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
           WHERE organization_id = ? AND provider_id = ?`,
          [actor, aid, uid]
        );
      } catch (e2) {
        if (!ignoreIfMissing(e2)) throw e2;
      }
    }

    try {
      await conn.execute(
        `UPDATE provider_school_assignments
         SET is_active = FALSE
         WHERE provider_user_id = ? AND school_organization_id = ?`,
        [uid, aid]
      );
    } catch (e) {
      if (!ignoreIfMissing(e)) throw e;
    }

    try {
      await conn.execute(
        `UPDATE school_day_provider_assignments
         SET is_active = FALSE
         WHERE provider_user_id = ? AND school_organization_id = ?`,
        [uid, aid]
      );
    } catch (e) {
      if (!ignoreIfMissing(e)) throw e;
    }

    try {
      await conn.execute(
        `DELETE FROM soft_schedule_slots
         WHERE provider_user_id = ? AND school_organization_id = ?`,
        [uid, aid]
      );
    } catch (e) {
      if (!ignoreIfMissing(e)) throw e;
    }

    try {
      await conn.execute(
        `DELETE FROM school_provider_schedule_entries
         WHERE provider_user_id = ? AND school_organization_id = ?`,
        [uid, aid]
      );
    } catch (e) {
      if (!ignoreIfMissing(e)) throw e;
    }
  }
}

async function execOptional(conn, sql, params) {
  try {
    await conn.execute(sql, params);
  } catch (e) {
    if (!ignoreIfMissing(e)) throw e;
  }
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
}
