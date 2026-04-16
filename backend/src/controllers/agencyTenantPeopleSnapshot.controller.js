import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';

const LIMIT = 60;

const ADMIN_STAFF_ROLES = new Set(['admin', 'staff', 'support', 'school_admin']);
const PROVIDER_ROLES = new Set(['provider', 'provider_plus', 'clinical_practice_assistant']);

async function assertAgencySnapshotAccess(req, agencyId) {
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return true;
  const userAgencies = await User.getAgencies(req.user.id);
  return (userAgencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

/**
 * GET /api/agencies/:id/settings-people-snapshot
 * Compact directory for Settings tenant hub: team roles, clients, guardians, optional program members.
 */
export const getTenantPeopleSnapshot = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.id, 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    const ok = await assertAgencySnapshotAccess(req, agencyId);
    if (!ok) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const agency = await Agency.findById(agencyId);
    if (!agency) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    const teamBaseSql = `
      FROM users u
      INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
        AND LOWER(COALESCE(u.role, '')) NOT IN ('client', 'client_guardian')
    `;

    const [[teamCountRow]] = await pool.execute(`SELECT COUNT(DISTINCT u.id) AS cnt ${teamBaseSql}`, [agencyId]);
    const teamTotal = Number(teamCountRow?.cnt || 0) || 0;

    const adminPlaceholders = [...ADMIN_STAFF_ROLES].map(() => '?').join(',');
    const adminRolesLower = [...ADMIN_STAFF_ROLES];
    const [[adminsCountRow]] = await pool.execute(
      `SELECT COUNT(DISTINCT u.id) AS cnt ${teamBaseSql} AND LOWER(COALESCE(u.role, '')) IN (${adminPlaceholders})`,
      [agencyId, ...adminRolesLower]
    );
    const adminsStaffTotal = Number(adminsCountRow?.cnt || 0) || 0;

    const provPlaceholders = [...PROVIDER_ROLES].map(() => '?').join(',');
    const provRolesLower = [...PROVIDER_ROLES];
    const [[provCountRow]] = await pool.execute(
      `SELECT COUNT(DISTINCT u.id) AS cnt ${teamBaseSql} AND LOWER(COALESCE(u.role, '')) IN (${provPlaceholders})`,
      [agencyId, ...provRolesLower]
    );
    const providersTotal = Number(provCountRow?.cnt || 0) || 0;

    const excludedForOther = [...adminRolesLower, ...provRolesLower];
    const otherPh = excludedForOther.map(() => '?').join(',');
    const [[otherCountRow]] = await pool.execute(
      `SELECT COUNT(DISTINCT u.id) AS cnt ${teamBaseSql} AND LOWER(COALESCE(u.role, '')) NOT IN (${otherPh})`,
      [agencyId, ...excludedForOther]
    );
    const otherTeamTotal = Number(otherCountRow?.cnt || 0) || 0;

    const [adminsStaff] = await pool.execute(
      `
      SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.status
      FROM users u
      INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
        AND LOWER(COALESCE(u.role, '')) IN (${adminPlaceholders})
      ORDER BY u.last_name, u.first_name, u.id
      LIMIT ${LIMIT}
    `,
      [agencyId, ...adminRolesLower]
    );

    const [providers] = await pool.execute(
      `
      SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.status
      FROM users u
      INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
        AND LOWER(COALESCE(u.role, '')) IN (${provPlaceholders})
      ORDER BY u.last_name, u.first_name, u.id
      LIMIT ${LIMIT}
    `,
      [agencyId, ...provRolesLower]
    );

    const [otherTeam] = await pool.execute(
      `
      SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.status
      FROM users u
      INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
        AND LOWER(COALESCE(u.role, '')) NOT IN ('client', 'client_guardian')
        AND LOWER(COALESCE(u.role, '')) NOT IN (${otherPh})
      ORDER BY u.role, u.last_name, u.first_name, u.id
      LIMIT ${LIMIT}
    `,
      [agencyId, ...excludedForOther]
    );

    const [[clientCountRow]] = await pool.execute(
      `
      SELECT COUNT(*) AS cnt
      FROM clients c
      WHERE c.agency_id = ?
        AND (c.status IS NULL OR UPPER(TRIM(c.status)) <> 'ARCHIVED')
    `,
      [agencyId]
    );
    const clientsTotal = Number(clientCountRow?.cnt || 0) || 0;

    const [clientRows] = await pool.execute(
      `
      SELECT c.id, c.full_name, c.initials, c.identifier_code, c.status
      FROM clients c
      WHERE c.agency_id = ?
        AND (c.status IS NULL OR UPPER(TRIM(c.status)) <> 'ARCHIVED')
      ORDER BY c.full_name, c.id DESC
      LIMIT ${LIMIT}
    `,
      [agencyId]
    );

    const [[guardianCountRow]] = await pool.execute(
      `
      SELECT COUNT(DISTINCT u.id) AS cnt
      FROM users u
      INNER JOIN client_guardians cg ON cg.guardian_user_id = u.id
      INNER JOIN clients c ON c.id = cg.client_id AND c.agency_id = ?
      WHERE LOWER(COALESCE(u.role, '')) = 'client_guardian'
        AND (u.is_archived = FALSE OR u.is_archived IS NULL)
    `,
      [agencyId]
    );
    const guardiansTotal = Number(guardianCountRow?.cnt || 0) || 0;

    const [guardianRows] = await pool.execute(
      `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        COUNT(DISTINCT cg.client_id) AS linked_clients_count
      FROM users u
      INNER JOIN client_guardians cg ON cg.guardian_user_id = u.id
      INNER JOIN clients c ON c.id = cg.client_id AND c.agency_id = ?
      WHERE LOWER(COALESCE(u.role, '')) = 'client_guardian'
        AND (u.is_archived = FALSE OR u.is_archived IS NULL)
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.role
      ORDER BY u.last_name, u.first_name
      LIMIT ${LIMIT}
    `,
      [agencyId]
    );

    let members = null;
    try {
      const [[{ cnt }]] = await pool.execute(
        'SELECT COUNT(*) AS cnt FROM challenge_member_applications WHERE agency_id = ?',
        [agencyId]
      );
      const total = Number(cnt || 0) || 0;
      if (total > 0) {
        const [memberRows] = await pool.execute(
          `
          SELECT
            a.id,
            a.status,
            a.first_name AS first_name,
            a.last_name AS last_name,
            a.email AS email,
            a.user_id AS user_id
          FROM challenge_member_applications a
          WHERE a.agency_id = ?
          ORDER BY a.id DESC
          LIMIT ${LIMIT}
        `,
          [agencyId]
        );
        members = { total, items: memberRows || [] };
      }
    } catch {
      members = null;
    }

    res.json({
      agencyId,
      agencyName: agency.name || null,
      organizationType: agency.organization_type || agency.organizationType || null,
      teamTotal,
      listCap: LIMIT,
      adminsStaff: {
        total: adminsStaffTotal,
        items: adminsStaff,
        truncated: adminsStaffTotal > (adminsStaff || []).length
      },
      providers: {
        total: providersTotal,
        items: providers,
        truncated: providersTotal > (providers || []).length
      },
      otherTeam: {
        total: otherTeamTotal,
        items: otherTeam,
        truncated: otherTeamTotal > (otherTeam || []).length
      },
      clients: {
        total: clientsTotal,
        items: clientRows || [],
        truncated: clientsTotal > (clientRows || []).length
      },
      guardians: {
        total: guardiansTotal,
        items: guardianRows || [],
        truncated: guardiansTotal > (guardianRows || []).length
      },
      members
    });
  } catch (e) {
    next(e);
  }
};
