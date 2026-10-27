import { changeAccountLifecycle } from './accountLifecycle.service.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Restore the existing identity and school permissions. Passwords, sessions,
// consent decisions, and school roles are not part of this operation.
export async function restoreSchoolStaffAccess({ userId, schoolOrganizationId, actorUserId }) {
  const result = await changeAccountLifecycle({
    userId, actorUserId, agencyId: schoolOrganizationId,
    source: 'school_portal_staff_access_restored',
    reason: 'An authorized school or agency administrator restored access to an existing school staff account.',
    mutate: async (conn, before) => {
      const [[user]] = await conn.execute('SELECT role FROM users WHERE id = ?', [userId]);
      if (user?.role !== 'school_staff') throw fail(400, 'Only school staff accounts can be restored here.');
      if (!['ACTIVE_EMPLOYEE', 'INACTIVE_EMPLOYEE', 'ARCHIVED'].includes(before.status)) {
        throw fail(409, 'Complete account setup before restoring access.');
      }
      const [[membership]] = await conn.execute(
        'SELECT is_active FROM user_agencies WHERE user_id = ? AND agency_id = ? FOR UPDATE',
        [userId, schoolOrganizationId]
      );
      if (!membership || [0, false, '0'].includes(membership.is_active)) {
        throw fail(409, 'This person no longer has an active assignment to this school.');
      }
      return (await conn.execute(
        `UPDATE users SET status = 'ACTIVE_EMPLOYEE', is_archived = FALSE, is_active = TRUE,
         archived_at = NULL, archived_by_user_id = NULL, archived_by_agency_id = NULL
         WHERE id = ?`, [userId]
      ))[0];
    }
  });
  if (!result.affectedRows) throw fail(404, 'School staff account not found.');
}
