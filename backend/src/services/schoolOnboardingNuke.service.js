import pool from '../config/database.js';
import SchoolOnboardingInvite from '../models/SchoolOnboardingInvite.model.js';
import Agency from '../models/Agency.model.js';

async function bestEffort(conn, sql, params = []) {
  try {
    await conn.execute(sql, params);
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes('ER_NO_SUCH_TABLE') || msg.includes("doesn't exist");
    if (!missing) throw e;
  }
}

async function deleteClientCascade(conn, clientId) {
  await bestEffort(conn, 'DELETE FROM client_note_reads WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM client_notes WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM client_status_history WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM client_paperwork_history WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM client_paperwork_items WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM client_access_logs WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM client_phi_documents WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM client_guardians WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM client_provider_assignments WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM client_organization_assignments WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM soft_schedule_slots WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM school_provider_schedule_entries WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM company_event_clients WHERE client_id = ?', [clientId]);
  await bestEffort(conn, 'DELETE FROM skills_group_clients WHERE client_id = ?', [clientId]);
  await conn.execute('DELETE FROM clients WHERE id = ?', [clientId]);
}

async function listDeletableSchoolStaffUserIds(conn, schoolId, tenantAgencyId) {
  const [rows] = await conn.execute(
    `SELECT DISTINCT u.id
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND LOWER(u.role) = 'school_staff'`,
    [schoolId]
  );
  const deletable = [];
  for (const row of rows || []) {
    const userId = Number(row.id);
    if (!userId) continue;
    const [agencyRows] = await conn.execute(
      'SELECT agency_id FROM user_agencies WHERE user_id = ?',
      [userId]
    );
    const agencyIds = new Set((agencyRows || []).map((r) => Number(r.agency_id)).filter(Boolean));
    agencyIds.delete(schoolId);
    if (tenantAgencyId) agencyIds.delete(tenantAgencyId);
    if (agencyIds.size === 0) deletable.push(userId);
  }
  return deletable;
}

async function deleteSchoolOrgRefs(conn, schoolId) {
  await bestEffort(conn, 'UPDATE company_events SET organization_id = NULL WHERE organization_id = ?', [schoolId]);
  const tables = [
    'skills_group_clients',
    'skills_group_providers',
    'skills_group_meetings',
    'skills_groups',
    'school_soft_schedule_notes',
    'school_soft_schedule_slots',
    'school_profiles',
    'school_contacts',
    'school_public_documents',
    'school_portal_announcements',
    'provider_school_assignments',
    'client_provider_assignments',
    'client_organization_assignments',
    'organization_affiliations',
    'agency_schools',
    'user_agencies',
    'school_onboarding_invites'
  ];
  const orgCols = ['school_organization_id', 'organization_id', 'school_id', 'agency_id'];
  for (const table of tables) {
    for (const col of orgCols) {
      await bestEffort(conn, `DELETE FROM \`${table}\` WHERE \`${col}\` = ?`, [schoolId]);
    }
  }
}

async function deleteUsers(conn, userIds) {
  let deleted = 0;
  for (const userId of userIds) {
    await bestEffort(conn, 'DELETE FROM user_agencies WHERE user_id = ?', [userId]);
    const [result] = await conn.execute('DELETE FROM users WHERE id = ?', [userId]);
    if (result?.affectedRows > 0) deleted += 1;
  }
  return deleted;
}

/**
 * Permanently delete a school created via onboarding plus its invite, clients, and school_staff users.
 * Intended for test / demo cleanup from the School Onboarding invites list.
 */
export async function nukeSchoolOnboardingInvite(inviteId, agencyId, { archivedByUserId = null } = {}) {
  const invite = await SchoolOnboardingInvite.findById(inviteId);
  if (!invite || invite.agency_id !== agencyId) {
    throw Object.assign(new Error('Invite not found'), { status: 404 });
  }

  const schoolId = Number(invite.school_organization_id);
  if (!schoolId) {
    throw Object.assign(new Error('Invite is missing a school organization'), { status: 409 });
  }

  const school = await Agency.findById(schoolId);
  if (!school) {
    throw Object.assign(new Error('School organization not found'), { status: 404 });
  }
  const orgType = String(school.organization_type || '').toLowerCase();
  if (orgType && orgType !== 'school') {
    throw Object.assign(new Error('Only school organizations can be nuked from onboarding'), { status: 400 });
  }

  const conn = await pool.getConnection();
  const summary = {
    schoolId,
    schoolName: school.name,
    inviteId,
    deletedClients: 0,
    deletedUsers: 0,
    schoolDeleted: false
  };

  try {
    await conn.beginTransaction();

    const [clientRows] = await conn.execute(
      'SELECT id FROM clients WHERE organization_id = ?',
      [schoolId]
    );
    for (const row of clientRows || []) {
      await deleteClientCascade(conn, Number(row.id));
      summary.deletedClients += 1;
    }

    const staffUserIds = await listDeletableSchoolStaffUserIds(conn, schoolId, agencyId);
    await deleteSchoolOrgRefs(conn, schoolId);
    summary.deletedUsers = await deleteUsers(conn, staffUserIds);

    if (!school.is_archived) {
      await Agency.archive(schoolId, archivedByUserId);
    }

    const [delSchool] = await conn.execute('DELETE FROM agencies WHERE id = ?', [schoolId]);
    summary.schoolDeleted = (delSchool?.affectedRows || 0) > 0;

    await conn.commit();
    return summary;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore
    }
    if (err?.code === 'ER_ROW_IS_REFERENCED' || err?.errno === 1451) {
      throw Object.assign(
        new Error(
          'Could not fully delete this school because other records still reference it. Archive the school and use Archive Management, or remove remaining clients/users first.'
        ),
        { status: 409, code: 'NUKE_BLOCKED' }
      );
    }
    throw err;
  } finally {
    conn.release();
  }
}
