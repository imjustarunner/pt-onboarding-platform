import { listEnrolledProviders } from './publicAgencyServices.controller.js';
import { providerProfileUrl } from '../../../frontend/src/navigation/providerProfileLinks.js';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { normalizePhoneExtension, staffWorkPhone } from '../utils/staffWorkContact.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';

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
      `SELECT u.id, u.first_name, u.last_name, u.preferred_name, u.work_phone,
              u.profile_photo_path, u.role, u.work_email,
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
         AND LOWER(COALESCE(u.role, '')) NOT IN (
               'client_guardian', 'guardian', 'school_staff',
               'super_admin', 'parent', 'client'
             )
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
      email: r.work_email || null,
      phoneNumber: r.work_phone || null,
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


// An employee directory has an explicit professional-only projection. Never fall
// back to the login email or personal phone when a work field is missing.
export const getStaffDirectory = async (req, res, next) => {
  try {
    const roles = ['super_admin','admin','support','staff','provider','provider_plus','supervisor','clinical_practice_assistant','intern','intern_plus','facilitator','tutor','clinician','assistant_admin'];
    if (!roles.includes(req.user?.role)) return res.status(403).json({error:{message:'Staff access is required.'}});
    const agencyId = Number(req.query.agencyId);
    if (!Number.isInteger(agencyId) || agencyId <= 0) return res.status(400).json({error:{message:'Choose an organization.'}});
    await assertAgencyAccess(req.user, agencyId);
    const [[agency]] = await pool.execute('SELECT id,slug,organization_type,feature_flags,phone_number FROM agencies WHERE id=? AND is_active=1', [agencyId]);
    if (!agency) return res.status(404).json({error:{message:'Organization not found.'}});
    const [rows] = await pool.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.preferred_name,u.title,u.role,u.department,
      u.work_email,u.work_phone,u.work_phone_extension,u.work_location,u.profile_photo_path
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
      WHERE COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND (COALESCE(u.is_demo,0)=0 OR ?=1)
      AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING')
      AND u.role IN (${roles.map(() => '?').join(',')}) ORDER BY u.last_name,u.first_name`, [agencyId,isAuricwellQaAgency(agency) ? 1 : 0,...roles]);
    const [locations] = await pool.execute(`SELECT ul.user_id,l.name,ul.is_primary FROM user_office_locations ul
      JOIN office_locations l ON l.id=ul.office_location_id AND l.is_active=1
      JOIN user_agencies ua ON ua.user_id=ul.user_id AND ua.agency_id=? AND ua.is_active=1
      WHERE ul.is_active=1 AND (l.agency_id=? OR EXISTS(SELECT 1 FROM office_location_agencies la WHERE la.office_location_id=l.id AND la.agency_id=?))
      ORDER BY ul.is_primary DESC,l.name`, [agencyId,agencyId,agencyId]);
    const publicProfiles = new Map();
    for (const service of ['counseling','tutoring','coaching','consulting']) {
      for (const person of await listEnrolledProviders(agencyId, service, {includeDirectory:true})) {
        if (!publicProfiles.has(Number(person.id))) publicProfiles.set(Number(person.id), service);
      }
    }
    res.json({staff: rows.map(row => {
      const service = publicProfiles.get(Number(row.id));
      const name = displayName(row);
      return { id: row.id, displayName: name, title: row.title || row.role, department: row.department || '',
        workEmail: row.work_email || null, workPhone: staffWorkPhone(agency, row.work_phone), extension: normalizePhoneExtension(row.work_phone_extension),
        primaryLocation: locations.find(l => Number(l.user_id)===Number(row.id) && Number(l.is_primary) === 1)?.name || row.work_location || null,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(row.profile_photo_path),
        profileUrl: !service ? null : agency.slug==='itsco' ? providerProfileUrl({...row,displayName:name}) : `/${encodeURIComponent(agency.slug)}/provider/${row.id}?serviceType=${service}`
      };
    })});
  } catch(error) { next(error); }
};
