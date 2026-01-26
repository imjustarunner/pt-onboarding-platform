import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';

const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const normalizeDay = (d) => {
  const s = String(d || '').trim();
  return allowedDays.includes(s) ? s : null;
};

async function ensureSchoolAccess(req, schoolId) {
  const schoolOrgId = parseInt(schoolId, 10);
  if (!schoolOrgId) return { ok: false, status: 400, message: 'Invalid schoolId' };

  const school = await Agency.findById(schoolOrgId);
  if (!school) return { ok: false, status: 404, message: 'School organization not found' };
  const orgType = String(school.organization_type || 'agency').toLowerCase();
  if (orgType !== 'school') return { ok: false, status: 400, message: 'This endpoint is only available for school organizations' };

  if (req.user?.role !== 'super_admin') {
    const orgs = await User.getAgencies(req.user.id);
    const hasDirect = (orgs || []).some((o) => parseInt(o.id, 10) === schoolOrgId);
    if (!hasDirect) {
      const role = String(req.user?.role || '').toLowerCase();
      const canUseAgencyAffiliation = role === 'admin' || role === 'support' || role === 'staff';
      if (!canUseAgencyAffiliation) return { ok: false, status: 403, message: 'You do not have access to this school organization' };
      const activeAgencyId =
        (await OrganizationAffiliation.getActiveAgencyIdForOrganization(schoolOrgId)) ||
        (await AgencySchool.getActiveAgencyIdForSchool(schoolOrgId)) ||
        null;
      const hasAgency = activeAgencyId
        ? (orgs || []).some((o) => parseInt(o.id, 10) === parseInt(activeAgencyId, 10))
        : false;
      if (!hasAgency) return { ok: false, status: 403, message: 'You do not have access to this school organization' };
    }
  }

  return { ok: true, school };
}

async function ensureProviderAffiliated(providerUserId, schoolId) {
  const orgs = await User.getAgencies(providerUserId);
  const ok = (orgs || []).some((o) => parseInt(o.id, 10) === parseInt(schoolId, 10));
  return { ok };
}

export const getProviderSchoolProfile = async (req, res, next) => {
  try {
    const { schoolId, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const providerUserId = parseInt(providerId, 10);
    if (!providerUserId) return res.status(400).json({ error: { message: 'Invalid providerId' } });

    // Provider privacy: providers may only view their own profile in this context.
    if (String(req.user?.role || '').toLowerCase() === 'provider' && parseInt(req.user?.id || 0, 10) !== providerUserId) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const aff = await ensureProviderAffiliated(providerUserId, schoolId);
    if (!aff.ok) return res.status(404).json({ error: { message: 'Provider is not affiliated with this school' } });

    const u = await User.findById(providerUserId);
    if (!u) return res.status(404).json({ error: { message: 'Provider not found' } });

    res.json({
      provider_user_id: u.id,
      first_name: u.first_name || null,
      last_name: u.last_name || null,
      email: u.email || null,
      title: u.title || null,
      service_focus: u.service_focus || null,
      profile_photo_url: publicUploadsUrlFromStoredPath(u.profile_photo_path || null)
    });
  } catch (e) {
    next(e);
  }
};

export const getProviderSchoolCaseloadSlots = async (req, res, next) => {
  try {
    const { schoolId, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const providerUserId = parseInt(providerId, 10);
    if (!providerUserId) return res.status(400).json({ error: { message: 'Invalid providerId' } });

    // Provider privacy: providers may only view their own caseload in this context.
    if (String(req.user?.role || '').toLowerCase() === 'provider' && parseInt(req.user?.id || 0, 10) !== providerUserId) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const aff = await ensureProviderAffiliated(providerUserId, schoolId);
    if (!aff.ok) return res.status(404).json({ error: { message: 'Provider is not affiliated with this school' } });

    const [assignments] = await pool.execute(
      `SELECT day_of_week, slots_total, slots_available, start_time, end_time, is_active
       FROM provider_school_assignments
       WHERE school_organization_id = ? AND provider_user_id = ?
       ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday') ASC`,
      [parseInt(schoolId, 10), providerUserId]
    );

    const activeDays = (assignments || [])
      .filter((a) => a && a.is_active)
      .map((a) => String(a.day_of_week))
      .filter((d) => normalizeDay(d));

    const clientsByDay = new Map();
    for (const d of allowedDays) clientsByDay.set(d, []);

    // Prefer multi-provider assignments; fall back to legacy clients columns.
    let clientRows = [];
    if (activeDays.length > 0) {
      const placeholders = activeDays.map(() => '?').join(',');
      try {
        const [rows] = await pool.execute(
          `SELECT c.id, c.initials, c.identifier_code, c.status, c.document_status, cpa.service_day
           FROM client_provider_assignments cpa
           JOIN clients c ON c.id = cpa.client_id
           WHERE cpa.organization_id = ?
             AND cpa.provider_user_id = ?
             AND cpa.is_active = TRUE
             AND cpa.service_day IN (${placeholders})
           ORDER BY cpa.service_day ASC, c.initials ASC`,
          [parseInt(schoolId, 10), providerUserId, ...activeDays]
        );
        clientRows = rows || [];
      } catch (e) {
        const msg = String(e?.message || '');
        const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
        if (!missing) throw e;
        const [rows] = await pool.execute(
          `SELECT id, initials, identifier_code, status, document_status, service_day
           FROM clients
           WHERE organization_id = ?
             AND provider_id = ?
             AND service_day IN (${placeholders})
           ORDER BY service_day ASC, initials ASC`,
          [parseInt(schoolId, 10), providerUserId, ...activeDays]
        );
        clientRows = rows || [];
      }

      const userId = req.user?.id;
      const unreadCounts = new Map();
      try {
        const ids = (clientRows || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
        if (ids.length > 0 && userId) {
          const p2 = ids.map(() => '?').join(',');
          const [unreadRows] = await pool.execute(
            `SELECT n.client_id, COUNT(*) AS unread_count
             FROM client_notes n
             LEFT JOIN client_note_reads r
               ON r.client_id = n.client_id AND r.user_id = ?
             WHERE n.client_id IN (${p2})
               AND n.is_internal_only = FALSE
               AND n.created_at > COALESCE(r.last_read_at, '1970-01-01')
             GROUP BY n.client_id`,
            [userId, ...ids]
          );
          for (const r of unreadRows || []) unreadCounts.set(Number(r.client_id), Number(r.unread_count || 0));
        }
      } catch {
        // ignore
      }

      for (const c of clientRows || []) {
        const d = String(c.service_day || c.service_day || '');
        const list = clientsByDay.get(d) || [];
        list.push({ ...c, unread_notes_count: unreadCounts.get(Number(c.id)) || 0 });
        clientsByDay.set(d, list);
      }
    }

    // Used count per day for display (assigned/total)
    const usedByDay = new Map();
    for (const d of allowedDays) usedByDay.set(d, (clientsByDay.get(d) || []).length);

    const out = (assignments || []).map((a) => ({
      day_of_week: a.day_of_week,
      slots_total: a.slots_total,
      slots_available: a.slots_available,
      slots_used: usedByDay.get(String(a.day_of_week)) || 0,
      start_time: a.start_time,
      end_time: a.end_time,
      is_active: !!a.is_active,
      clients: clientsByDay.get(String(a.day_of_week)) || []
    }));

    res.json({
      school_organization_id: parseInt(schoolId, 10),
      provider_user_id: providerUserId,
      assignments: out
    });
  } catch (e) {
    next(e);
  }
};

