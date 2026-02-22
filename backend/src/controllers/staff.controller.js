import pool from '../config/database.js';
import User from '../models/User.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

async function assertAgencyAccess(reqUser, agencyId) {
  if (reqUser.role === 'super_admin') return true;
  const agencies = await User.getAgencies(reqUser.id);
  const ids = (agencies || []).map((a) => Number(a?.id)).filter(Boolean);
  if (!ids.includes(Number(agencyId))) {
    const err = new Error('Access denied to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

async function assertKudosEnabled(agencyId) {
  const [rows] = await pool.execute(
    'SELECT feature_flags FROM agencies WHERE id = ?',
    [agencyId]
  );
  let flags = {};
  if (rows?.[0]?.feature_flags) {
    try {
      flags = typeof rows[0].feature_flags === 'string'
        ? JSON.parse(rows[0].feature_flags)
        : rows[0].feature_flags;
    } catch {
      /* ignore */
    }
  }
  if (flags.kudosEnabled !== true) {
    const err = new Error('Kudos is not enabled for this agency');
    err.status = 403;
    throw err;
  }
}

function displayName(row) {
  const first = row.first_name || '';
  const last = row.last_name || '';
  const preferred = row.preferred_name || '';
  if (preferred) return `${first} "${preferred}" ${last}`.trim();
  return `${first} ${last}`.trim() || 'Unknown';
}

/**
 * GET /api/staff/coworkers - List coworkers in the same agency
 */
export const getCoworkers = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    await assertAgencyAccess(req.user, agencyId);
    await assertKudosEnabled(agencyId);

    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.preferred_name, u.email, u.phone_number,
              u.profile_photo_path, u.role, u.work_email, u.personal_email,
              sa_sup.id IS NOT NULL AS is_supervisor,
              sa_sub.id IS NOT NULL AS is_supervisee
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       LEFT JOIN supervisor_assignments sa_sup
         ON sa_sup.supervisor_id = u.id
         AND sa_sup.supervisee_id = ?
         AND sa_sup.agency_id = ?
       LEFT JOIN supervisor_assignments sa_sub
         ON sa_sub.supervisee_id = u.id
         AND sa_sub.supervisor_id = ?
         AND sa_sub.agency_id = ?
       WHERE ua.agency_id = ?
         AND u.id != ?
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND LOWER(COALESCE(u.role, '')) != 'school_staff'
         AND UPPER(COALESCE(u.status, '')) IN ('ACTIVE_EMPLOYEE', 'ONBOARDING')
       ORDER BY (sa_sup.id IS NOT NULL OR sa_sub.id IS NOT NULL) DESC,
                u.first_name ASC, u.last_name ASC`,
      [currentUserId, agencyId, currentUserId, agencyId, agencyId, currentUserId]
    );

    const coworkers = (rows || []).map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      preferredName: r.preferred_name,
      displayName: displayName(r),
      email: r.email || r.work_email || r.personal_email,
      phoneNumber: r.phone_number,
      profilePhotoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path),
      role: r.role,
      isSupervisor: !!r.is_supervisor,
      isSupervisee: !!r.is_supervisee
    }));

    const management = coworkers.filter((c) => c.isSupervisor);
    const peers = coworkers.filter((c) => !c.isSupervisor);

    res.json({
      coworkers,
      management,
      peers
    });
  } catch (e) {
    next(e);
  }
};
