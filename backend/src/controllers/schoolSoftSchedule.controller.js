import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { adjustProviderSlots } from '../services/providerSlots.service.js';
import {
  getSupervisorSuperviseeIds,
  isSupervisorActor,
  supervisorHasSuperviseeInSchool
} from '../utils/supervisorSchoolAccess.js';

const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const normalizeDay = (d) => {
  const s = String(d || '').trim();
  return allowedDays.includes(s) ? s : null;
};

const normalizeTime = (t) => {
  const s = String(t || '').trim();
  if (!s) return null;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return null;
};

const timeToMinutes = (t) => {
  const s = String(t || '').slice(0, 8);
  const m = s.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
};

const minutesToTime = (mins) => {
  const m = Number(mins);
  if (!Number.isFinite(m)) return null;
  const hh = Math.max(0, Math.min(23, Math.floor(m / 60)));
  const mm = Math.max(0, Math.min(59, Math.floor(m % 60)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
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
      const hasSupervisorCapability = await isSupervisorActor({ userId: req.user?.id, role, user: req.user });
      if (hasSupervisorCapability) {
        const canSupervisorAccess = await supervisorHasSuperviseeInSchool(req.user?.id, schoolOrgId);
        if (canSupervisorAccess) return { ok: true, school, supervisorLimited: true };
      }
      const canUseAgencyAffiliation = role === 'admin' || role === 'support' || role === 'staff' || role === 'supervisor';
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

function canManageSchoolDayProviders(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'school_staff' || role === 'admin' || role === 'support' || role === 'super_admin';
}

function canEditSoftSchedule(req, providerUserId) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'school_staff') return true;
  if (role === 'admin' || role === 'support' || role === 'super_admin') return true;
  if (role === 'provider') return parseInt(req.user?.id, 10) === parseInt(providerUserId, 10);
  return false;
}

/** Who can edit roster Assigned Day for a provider at this school. */
function canEditClientAssignedDay(req, providerUserId) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff') return true;
  if (role === 'school_staff') return true;
  if (role === 'provider' || role === 'provider_plus') {
    return parseInt(req.user?.id, 10) === parseInt(providerUserId, 10);
  }
  return false;
}

async function ensureClientAffiliatedToSchool({ clientId, schoolId }) {
  const sid = parseInt(schoolId, 10);
  const cid = parseInt(clientId, 10);
  try {
    const [rows] = await pool.execute(
      `SELECT 1 AS ok
       FROM client_organization_assignments
       WHERE client_id = ? AND organization_id = ? AND is_active = TRUE
       LIMIT 1`,
      [cid, sid]
    );
    if (rows?.[0]) return { ok: true };
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) throw e;
  }
  const [legacy] = await pool.execute(
    `SELECT id FROM clients WHERE id = ? AND organization_id = ? LIMIT 1`,
    [cid, sid]
  );
  return legacy?.[0] ? { ok: true } : { ok: false };
}

async function ensureProviderOnSchoolDay({ schoolId, weekday, providerUserId, actorUserId }) {
  const sid = parseInt(schoolId, 10);
  const puid = parseInt(providerUserId, 10);
  const meta = await getProviderSchoolAssignmentMeta({ schoolId: sid, weekday, providerUserId: puid });
  if (!meta) {
    return { ok: false, message: 'Provider is not scheduled (active) for this school/day. Set work hours first.' };
  }
  await pool.execute(
    `INSERT INTO school_day_schedules (school_organization_id, weekday, is_active, created_by_user_id)
     VALUES (?, ?, TRUE, ?)
     ON DUPLICATE KEY UPDATE is_active = TRUE`,
    [sid, weekday, actorUserId || null]
  );
  await pool.execute(
    `INSERT INTO school_day_provider_assignments (school_organization_id, weekday, provider_user_id, is_active, created_by_user_id)
     VALUES (?, ?, ?, TRUE, ?)
     ON DUPLICATE KEY UPDATE is_active = TRUE`,
    [sid, weekday, puid, actorUserId || null]
  );
  return { ok: true, meta };
}

async function loadSoftSlotsOrDefaults({ schoolId, weekday, providerUserId }) {
  const sid = parseInt(schoolId, 10);
  const puid = parseInt(providerUserId, 10);
  const [rows] = await pool.execute(
    `SELECT id, slot_index, start_time, end_time, client_id, note
     FROM soft_schedule_slots
     WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?
     ORDER BY slot_index ASC`,
    [sid, weekday, puid]
  );
  if ((rows || []).length > 0) {
    return { persisted: true, slots: rows || [] };
  }
  const meta = await getProviderSchoolAssignmentMeta({ schoolId: sid, weekday, providerUserId: puid });
  const slotCount = meta?.slots_total ? parseInt(meta.slots_total, 10) : 7;
  const startTime = meta?.start_time ? String(meta.start_time) : '08:00:00';
  const endTime = meta?.end_time ? String(meta.end_time) : '15:00:00';
  return { persisted: false, slots: buildDefaultSlots({ slotCount, startTime, endTime }) };
}

async function ensureSupervisorCanAccessProvider({ req, access, providerUserId }) {
  if (!access?.supervisorLimited) return true;
  const superviseeIds = await getSupervisorSuperviseeIds(req.user?.id, null);
  return (superviseeIds || []).some((id) => parseInt(id, 10) === parseInt(providerUserId, 10));
}

async function ensureProviderAssignedToDay({ schoolId, weekday, providerUserId }) {
  const [rows] = await pool.execute(
    `SELECT id
     FROM school_day_provider_assignments
     WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ? AND is_active = TRUE
     LIMIT 1`,
    [parseInt(schoolId, 10), String(weekday), parseInt(providerUserId, 10)]
  );
  return rows?.[0]?.id ? { ok: true } : { ok: false };
}

async function getProviderSchoolAssignmentMeta({ schoolId, weekday, providerUserId }) {
  const [rows] = await pool.execute(
    `SELECT slots_total, start_time, end_time
     FROM provider_school_assignments
     WHERE school_organization_id = ? AND day_of_week = ? AND provider_user_id = ? AND is_active = TRUE
     LIMIT 1`,
    [parseInt(schoolId, 10), String(weekday), parseInt(providerUserId, 10)]
  );
  return rows?.[0] || null;
}

function buildDefaultSlots({ slotCount, startTime, endTime }) {
  const count = Math.max(1, Math.min(50, parseInt(slotCount || 0, 10) || 7));
  const startM = timeToMinutes(startTime);
  const endM = timeToMinutes(endTime);
  const hasRange = Number.isFinite(startM) && Number.isFinite(endM) && endM > startM;

  const total = hasRange ? endM - startM : null;
  const per = hasRange ? Math.max(5, Math.floor(total / count)) : null;

  const out = [];
  for (let i = 0; i < count; i++) {
    const slotStart = hasRange ? minutesToTime(startM + per * i) : null;
    const slotEnd = hasRange ? minutesToTime(i === count - 1 ? endM : (startM + per * (i + 1))) : null;
    out.push({
      id: null,
      slot_index: i + 1,
      start_time: slotStart,
      end_time: slotEnd,
      client_id: null,
      note: null,
      is_default: true
    });
  }
  return out;
}

export const listSchoolDays = async (req, res, next) => {
  try {
    const { schoolId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const [dayRows] = await pool.execute(
      `SELECT weekday, is_active
       FROM school_day_schedules
       WHERE school_organization_id = ?`,
      [parseInt(schoolId, 10)]
    );
    const dayMap = new Map((dayRows || []).map((r) => [String(r.weekday), !!r.is_active]));

    // Count only providers still affiliated with the school organization.
    const [provRows] = await pool.execute(
      `SELECT a.weekday, COUNT(*) AS provider_count
       FROM school_day_provider_assignments a
       JOIN user_agencies ua
         ON ua.user_id = a.provider_user_id
        AND ua.agency_id = a.school_organization_id
       WHERE a.school_organization_id = ? AND a.is_active = TRUE
       GROUP BY a.weekday`,
      [parseInt(schoolId, 10)]
    );
    const provMap = new Map((provRows || []).map((r) => [String(r.weekday), Number(r.provider_count || 0)]));

    const out = allowedDays.map((weekday) => ({
      weekday,
      is_active: dayMap.get(weekday) || false,
      has_providers: (provMap.get(weekday) || 0) > 0
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const upsertSchoolDay = async (req, res, next) => {
  try {
    const { schoolId, weekday: weekdayParam } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (!canManageSchoolDayProviders(req)) {
      return res.status(403).json({ error: { message: 'Only school staff or admin/support can add days.' } });
    }

    const weekday = normalizeDay(weekdayParam);
    if (!weekday) return res.status(400).json({ error: { message: `Invalid weekday (allowed: ${allowedDays.join(', ')})` } });

    await pool.execute(
      `INSERT INTO school_day_schedules (school_organization_id, weekday, is_active, created_by_user_id)
       VALUES (?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE is_active = TRUE`,
      [parseInt(schoolId, 10), weekday, req.user.id]
    );

    const [rows] = await pool.execute(
      `SELECT * FROM school_day_schedules WHERE school_organization_id = ? AND weekday = ? LIMIT 1`,
      [parseInt(schoolId, 10), weekday]
    );
    res.status(201).json(rows?.[0] || { school_organization_id: parseInt(schoolId, 10), weekday, is_active: true });
  } catch (e) {
    next(e);
  }
};

export const listDayProviders = async (req, res, next) => {
  try {
    const { schoolId, weekday: weekdayParam } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const weekday = normalizeDay(weekdayParam);
    if (!weekday) return res.status(400).json({ error: { message: `Invalid weekday (allowed: ${allowedDays.join(', ')})` } });

    // Provider privacy: providers should only be able to view their own schedule/caseload.
    const role = String(req.user?.role || '').toLowerCase();
    let providerOnlyUserId = role === 'provider' ? parseInt(req.user?.id || 0, 10) : null;
    if (access.supervisorLimited) {
      const superviseeIds = await getSupervisorSuperviseeIds(req.user?.id, null);
      if ((superviseeIds || []).length === 0) return res.json([]);
      providerOnlyUserId = null;
    }

    const [rows] = await pool.execute(
      `SELECT a.id AS day_provider_assignment_id,
              a.provider_user_id,
              u.first_name,
              u.last_name,
              u.email,
              psa.slots_total,
              psa.slots_available,
              psa.start_time,
              psa.end_time
       FROM school_day_provider_assignments a
       JOIN user_agencies ua
         ON ua.user_id = a.provider_user_id
        AND ua.agency_id = a.school_organization_id
       JOIN users u ON u.id = a.provider_user_id
       LEFT JOIN provider_school_assignments psa
         ON psa.school_organization_id = a.school_organization_id
        AND psa.provider_user_id = a.provider_user_id
        AND psa.day_of_week COLLATE utf8mb4_unicode_ci = a.weekday COLLATE utf8mb4_unicode_ci
        AND psa.is_active = TRUE
       WHERE a.school_organization_id = ? AND a.weekday = ? COLLATE utf8mb4_unicode_ci AND a.is_active = TRUE
         AND (? IS NULL OR a.provider_user_id = ?)
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [parseInt(schoolId, 10), weekday, providerOnlyUserId, providerOnlyUserId]
    );

    // Compute assigned client count per provider/day for display (so "4/7" reflects reality even if slots_available drifted).
    const providerIds = (rows || []).map((r) => parseInt(r.provider_user_id, 10)).filter(Boolean);
    const assignedCountByProvider = new Map();
    if (providerIds.length > 0) {
      try {
        const placeholders = providerIds.map(() => '?').join(',');
        const [cntRows] = await pool.execute(
          `SELECT cpa.provider_user_id, COUNT(*) AS cnt
           FROM client_provider_assignments cpa
           JOIN clients c ON c.id = cpa.client_id
           WHERE cpa.organization_id = ?
             AND cpa.service_day = ?
             AND cpa.is_active = TRUE
             AND c.status <> 'ARCHIVED'
             AND cpa.provider_user_id IN (${placeholders})
           GROUP BY cpa.provider_user_id`,
          [parseInt(schoolId, 10), weekday, ...providerIds]
        );
        for (const r of cntRows || []) assignedCountByProvider.set(Number(r.provider_user_id), Number(r.cnt || 0));
      } catch (e) {
        const msg = String(e?.message || '');
        const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
        if (!missing) throw e;
        const placeholders = providerIds.map(() => '?').join(',');
        const [cntRows] = await pool.execute(
          `SELECT provider_id AS provider_user_id, COUNT(*) AS cnt
           FROM clients
           WHERE organization_id = ?
             AND service_day = ?
             AND status <> 'ARCHIVED'
             AND provider_id IN (${placeholders})
           GROUP BY provider_id`,
          [parseInt(schoolId, 10), weekday, ...providerIds]
        );
        for (const r of cntRows || []) assignedCountByProvider.set(Number(r.provider_user_id), Number(r.cnt || 0));
      }
    }

    let out = (rows || []).map((r) => {
      const used = assignedCountByProvider.get(Number(r.provider_user_id)) || 0;
      const total = r.slots_total === null || r.slots_total === undefined ? null : Number(r.slots_total);
      const availCalc = total === null || !Number.isFinite(total) ? null : Math.max(0, total - used);
      return {
        ...r,
        slots_used: used,
        slots_available_calculated: availCalc,
        profile_photo_url: null
      };
    });
    if (access.supervisorLimited) {
      const superviseeIds = new Set(await getSupervisorSuperviseeIds(req.user?.id, null));
      out = out.filter((r) => superviseeIds.has(Number(r.provider_user_id)));
    }

    // Best-effort: attach provider profile photo URLs if column exists.
    try {
      const providerIds = (out || []).map((r) => parseInt(r.provider_user_id, 10)).filter(Boolean);
      if (providerIds.length > 0) {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [cols] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_photo_path' LIMIT 1",
          [dbName]
        );
        const hasCol = (cols || []).length > 0;
        if (hasCol) {
          const placeholders = providerIds.map(() => '?').join(',');
          const [pRows] = await pool.execute(`SELECT id, profile_photo_path FROM users WHERE id IN (${placeholders})`, providerIds);
          const byId = new Map((pRows || []).map((x) => [Number(x.id), x.profile_photo_path]));
          for (const obj of out) {
            const stored = byId.get(Number(obj.provider_user_id)) || null;
            obj.profile_photo_url = publicUploadsUrlFromStoredPath(stored);
          }
        }
      }
    } catch {
      // ignore
    }

    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const addProviderToDay = async (req, res, next) => {
  try {
    const { schoolId, weekday: weekdayParam } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (!canManageSchoolDayProviders(req)) {
      return res.status(403).json({ error: { message: 'Only school staff or admin/support can add providers to a day.' } });
    }

    const weekday = normalizeDay(weekdayParam);
    if (!weekday) return res.status(400).json({ error: { message: `Invalid weekday (allowed: ${allowedDays.join(', ')})` } });

    const providerUserId = parseInt(req.body?.providerUserId, 10);
    if (!providerUserId) return res.status(400).json({ error: { message: 'providerUserId is required' } });

    // Ensure provider is affiliated with this school org.
    const orgs = await User.getAgencies(providerUserId);
    const affiliated = (orgs || []).some((o) => parseInt(o.id, 10) === parseInt(schoolId, 10));
    if (!affiliated) {
      return res.status(400).json({ error: { message: 'Provider is not affiliated with this school organization' } });
    }

    // Ensure provider has an active provider_school_assignment for that day (they set their own work schedule).
    const meta = await getProviderSchoolAssignmentMeta({ schoolId, weekday, providerUserId });
    if (!meta) {
      return res.status(409).json({ error: { message: 'Provider is not scheduled (active) for this school/day. Provider/admin must set work hours first.' } });
    }

    // Ensure the day exists (best-effort) so the day can be considered “added”.
    await pool.execute(
      `INSERT INTO school_day_schedules (school_organization_id, weekday, is_active, created_by_user_id)
       VALUES (?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE is_active = TRUE`,
      [parseInt(schoolId, 10), weekday, req.user.id]
    );

    await pool.execute(
      `INSERT INTO school_day_provider_assignments (school_organization_id, weekday, provider_user_id, is_active, created_by_user_id)
       VALUES (?, ?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE is_active = TRUE`,
      [parseInt(schoolId, 10), weekday, providerUserId, req.user.id]
    );

    const [rows] = await pool.execute(
      `SELECT id AS day_provider_assignment_id, school_organization_id, weekday, provider_user_id, is_active
       FROM school_day_provider_assignments
       WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?
       LIMIT 1`,
      [parseInt(schoolId, 10), weekday, providerUserId]
    );
    res.status(201).json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const getSoftScheduleSlots = async (req, res, next) => {
  try {
    const { schoolId, weekday: weekdayParam, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const weekday = normalizeDay(weekdayParam);
    if (!weekday) return res.status(400).json({ error: { message: `Invalid weekday (allowed: ${allowedDays.join(', ')})` } });

    const providerUserId = parseInt(providerId, 10);
    if (!providerUserId) return res.status(400).json({ error: { message: 'Invalid providerId' } });
    const providerAllowed = await ensureSupervisorCanAccessProvider({ req, access, providerUserId });
    if (!providerAllowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const assigned = await ensureProviderAssignedToDay({ schoolId, weekday, providerUserId });
    if (!assigned.ok) {
      return res.status(404).json({ error: { message: 'Provider is not added to this school/day yet.' } });
    }

    const [rows] = await pool.execute(
      `SELECT id, slot_index, start_time, end_time, client_id, note
       FROM soft_schedule_slots
       WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?
       ORDER BY slot_index ASC`,
      [parseInt(schoolId, 10), weekday, providerUserId]
    );

    if ((rows || []).length > 0) {
      return res.json({ persisted: true, slots: rows || [] });
    }

    const meta = await getProviderSchoolAssignmentMeta({ schoolId, weekday, providerUserId });
    const slotCount = meta?.slots_total ? parseInt(meta.slots_total, 10) : 7;
    const startTime = meta?.start_time ? String(meta.start_time) : '08:00:00';
    const endTime = meta?.end_time ? String(meta.end_time) : '15:00:00';

    const slots = buildDefaultSlots({ slotCount, startTime, endTime });
    return res.json({ persisted: false, slots });
  } catch (e) {
    next(e);
  }
};

export const putSoftScheduleSlots = async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { schoolId, weekday: weekdayParam, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const weekday = normalizeDay(weekdayParam);
    if (!weekday) return res.status(400).json({ error: { message: `Invalid weekday (allowed: ${allowedDays.join(', ')})` } });

    const providerUserId = parseInt(providerId, 10);
    if (!providerUserId) return res.status(400).json({ error: { message: 'Invalid providerId' } });

    if (!canEditSoftSchedule(req, providerUserId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const assigned = await ensureProviderAssignedToDay({ schoolId, weekday, providerUserId });
    if (!assigned.ok) {
      return res.status(404).json({ error: { message: 'Provider is not added to this school/day yet.' } });
    }

    const slotsInput = Array.isArray(req.body?.slots) ? req.body.slots : (Array.isArray(req.body) ? req.body : []);
    if (!Array.isArray(slotsInput)) return res.status(400).json({ error: { message: 'slots must be an array' } });
    if (slotsInput.length === 0) return res.status(400).json({ error: { message: 'At least one slot is required' } });
    if (slotsInput.length > 50) return res.status(400).json({ error: { message: 'Too many slots (max 50)' } });

    // Validate + collect client IDs for eligibility checks.
    const requestedClientIds = [];
    const normalizedSlots = slotsInput.map((s) => {
      const id = s?.id ? parseInt(s.id, 10) : null;
      const startTime = normalizeTime(s?.start_time ?? s?.startTime ?? null);
      const endTime = normalizeTime(s?.end_time ?? s?.endTime ?? null);
      const note = s?.note === undefined ? null : (s.note === null ? null : String(s.note));
      const clientId = s?.client_id !== undefined ? (s.client_id === null || s.client_id === '' ? null : parseInt(s.client_id, 10))
        : (s?.clientId === null || s?.clientId === '' || s?.clientId === undefined ? null : parseInt(s.clientId, 10));

      if ((startTime && !endTime) || (!startTime && endTime)) {
        throw Object.assign(new Error('Both start_time and end_time are required when setting times.'), { status: 400 });
      }
      if (clientId) requestedClientIds.push(clientId);

      return { id, start_time: startTime, end_time: endTime, note, client_id: clientId };
    });

    // Client eligibility: client must belong to this school AND be assigned to this provider/day.
    if (requestedClientIds.length > 0) {
      const unique = Array.from(new Set(requestedClientIds.map((x) => parseInt(x, 10)).filter(Boolean)));
      const placeholders = unique.map(() => '?').join(',');
      const sid = parseInt(schoolId, 10);
      const puid = parseInt(providerUserId, 10);
      const [cpaRows] = await connection.execute(
        `SELECT cpa.client_id AS id
         FROM client_provider_assignments cpa
         JOIN client_organization_assignments coa
           ON coa.client_id = cpa.client_id
          AND coa.organization_id = cpa.organization_id
          AND coa.is_active = TRUE
         WHERE cpa.client_id IN (${placeholders})
           AND cpa.organization_id = ?
           AND cpa.provider_user_id = ?
           AND cpa.service_day = ?
           AND cpa.is_active = TRUE`,
        [...unique, sid, puid, weekday]
      );
      const allowedByCpa = new Set((cpaRows || []).map((r) => Number(r.id)));
      const [legacyRows] = await connection.execute(
        `SELECT id, organization_id, provider_id, service_day
         FROM clients
         WHERE id IN (${placeholders})`,
        unique
      );
      const legacyById = new Map((legacyRows || []).map((r) => [Number(r.id), r]));
      for (const cid of unique) {
        if (allowedByCpa.has(Number(cid))) continue;
        const c = legacyById.get(Number(cid));
        if (!c) throw Object.assign(new Error('Client not found'), { status: 404 });
        if (parseInt(c.organization_id, 10) !== sid) {
          throw Object.assign(new Error('Client does not belong to this school organization'), { status: 400 });
        }
        if (parseInt(c.provider_id || 0, 10) !== puid || String(c.service_day || '') !== String(weekday)) {
          throw Object.assign(new Error('Client is not assigned to this provider/day. Admin/support/provider must assign first.'), { status: 409 });
        }
      }
    }

    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      `SELECT id
       FROM soft_schedule_slots
       WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?
       FOR UPDATE`,
      [parseInt(schoolId, 10), weekday, providerUserId]
    );
    const existingIds = new Set((existingRows || []).map((r) => Number(r.id)));
    const keptIds = new Set();

    for (let i = 0; i < normalizedSlots.length; i++) {
      const slot = normalizedSlots[i];
      const slotIndex = i + 1;
      const isExisting = slot.id && existingIds.has(Number(slot.id));

      if (isExisting) {
        await connection.execute(
          `UPDATE soft_schedule_slots
           SET slot_index = ?, start_time = ?, end_time = ?, client_id = ?, note = ?, updated_by_user_id = ?
           WHERE id = ?`,
          [slotIndex, slot.start_time, slot.end_time, slot.client_id, slot.note, req.user.id, slot.id]
        );
        keptIds.add(Number(slot.id));
      } else {
        const [ins] = await connection.execute(
          `INSERT INTO soft_schedule_slots
            (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            parseInt(schoolId, 10),
            weekday,
            providerUserId,
            slotIndex,
            slot.start_time,
            slot.end_time,
            slot.client_id,
            slot.note,
            req.user.id,
            req.user.id
          ]
        );
        keptIds.add(Number(ins.insertId));
      }
    }

    const toDelete = Array.from(existingIds).filter((id) => !keptIds.has(id));
    if (toDelete.length > 0) {
      const placeholders = toDelete.map(() => '?').join(',');
      await connection.execute(
        `DELETE FROM soft_schedule_slots WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ? AND id IN (${placeholders})`,
        [parseInt(schoolId, 10), weekday, providerUserId, ...toDelete]
      );
    }

    await connection.commit();

    const [rows] = await pool.execute(
      `SELECT id, slot_index, start_time, end_time, client_id, note
       FROM soft_schedule_slots
       WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?
       ORDER BY slot_index ASC`,
      [parseInt(schoolId, 10), weekday, providerUserId]
    );
    res.json({ persisted: true, slots: rows || [] });
  } catch (e) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    const status = e?.status || null;
    if (status) return res.status(status).json({ error: { message: e.message } });
    next(e);
  } finally {
    connection.release();
  }
};

export const moveSoftScheduleSlot = async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { schoolId, weekday: weekdayParam, providerId, slotId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const weekday = normalizeDay(weekdayParam);
    if (!weekday) return res.status(400).json({ error: { message: `Invalid weekday (allowed: ${allowedDays.join(', ')})` } });

    const providerUserId = parseInt(providerId, 10);
    const id = parseInt(slotId, 10);
    if (!providerUserId || !id) return res.status(400).json({ error: { message: 'Invalid providerId or slotId' } });

    if (!canEditSoftSchedule(req, providerUserId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const assigned = await ensureProviderAssignedToDay({ schoolId, weekday, providerUserId });
    if (!assigned.ok) {
      return res.status(404).json({ error: { message: 'Provider is not added to this school/day yet.' } });
    }

    const direction = String(req.body?.direction || '').trim().toLowerCase();
    if (direction !== 'up' && direction !== 'down') {
      return res.status(400).json({ error: { message: 'direction must be up or down' } });
    }

    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, slot_index
       FROM soft_schedule_slots
       WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?
       ORDER BY slot_index ASC
       FOR UPDATE`,
      [parseInt(schoolId, 10), weekday, providerUserId]
    );
    const list = rows || [];
    const idx = list.findIndex((r) => Number(r.id) === Number(id));
    if (idx < 0) {
      await connection.rollback();
      return res.status(404).json({ error: { message: 'Slot not found' } });
    }
    const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= list.length) {
      await connection.commit();
      const [outRows] = await pool.execute(
        `SELECT id, slot_index, start_time, end_time, client_id, note
         FROM soft_schedule_slots
         WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?
         ORDER BY slot_index ASC`,
        [parseInt(schoolId, 10), weekday, providerUserId]
      );
      return res.json({ moved: false, slots: outRows || [] });
    }

    const a = list[idx];
    const b = list[neighborIdx];
    await connection.execute(`UPDATE soft_schedule_slots SET slot_index = ?, updated_by_user_id = ? WHERE id = ?`, [b.slot_index, req.user.id, a.id]);
    await connection.execute(`UPDATE soft_schedule_slots SET slot_index = ?, updated_by_user_id = ? WHERE id = ?`, [a.slot_index, req.user.id, b.id]);

    await connection.commit();
    const [outRows] = await pool.execute(
      `SELECT id, slot_index, start_time, end_time, client_id, note
       FROM soft_schedule_slots
       WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?
       ORDER BY slot_index ASC`,
      [parseInt(schoolId, 10), weekday, providerUserId]
    );
    res.json({ moved: true, slots: outRows || [] });
  } catch (e) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    next(e);
  } finally {
    connection.release();
  }
};

/**
 * Context for roster "Assigned Day" editor.
 * GET /api/school-portal/:schoolId/clients/:clientId/day-assignment-context?providerUserId=
 */
export const getClientDayAssignmentContext = async (req, res, next) => {
  try {
    const schoolId = parseInt(req.params.schoolId, 10);
    const clientId = parseInt(req.params.clientId, 10);
    const providerUserId = parseInt(req.query?.providerUserId || req.query?.provider_user_id, 10);
    if (!schoolId || !clientId || !providerUserId) {
      return res.status(400).json({ error: { message: 'schoolId, clientId, and providerUserId are required' } });
    }

    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!canEditClientAssignedDay(req, providerUserId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const providerAllowed = await ensureSupervisorCanAccessProvider({ req, access, providerUserId });
    if (!providerAllowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const affiliated = await ensureClientAffiliatedToSchool({ clientId, schoolId });
    if (!affiliated.ok) {
      return res.status(404).json({ error: { message: 'Client is not affiliated with this school' } });
    }

    const [provRows] = await pool.execute(
      `SELECT id, first_name, last_name FROM users WHERE id = ? LIMIT 1`,
      [providerUserId]
    );
    const provider = provRows?.[0] || null;
    if (!provider) return res.status(404).json({ error: { message: 'Provider not found' } });

    const [workRows] = await pool.execute(
      `SELECT day_of_week, slots_total, slots_available, start_time, end_time
       FROM provider_school_assignments
       WHERE school_organization_id = ? AND provider_user_id = ? AND is_active = TRUE
         AND day_of_week IN (${allowedDays.map(() => '?').join(',')})
       ORDER BY FIELD(day_of_week, ${allowedDays.map(() => '?').join(',')})`,
      [schoolId, providerUserId, ...allowedDays, ...allowedDays]
    );

    let assignedDays = [];
    try {
      const [aRows] = await pool.execute(
        `SELECT id, service_day
         FROM client_provider_assignments
         WHERE client_id = ? AND organization_id = ? AND provider_user_id = ? AND is_active = TRUE`,
        [clientId, schoolId, providerUserId]
      );
      assignedDays = (aRows || [])
        .map((r) => ({
          assignment_id: Number(r.id),
          service_day: r.service_day ? String(r.service_day) : null
        }))
        .filter((r) => r.service_day && allowedDays.includes(r.service_day));
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) throw e;
      const [legacy] = await pool.execute(
        `SELECT provider_id, service_day FROM clients WHERE id = ? LIMIT 1`,
        [clientId]
      );
      const day = legacy?.[0]?.service_day ? String(legacy[0].service_day) : null;
      if (
        parseInt(legacy?.[0]?.provider_id || 0, 10) === providerUserId &&
        day &&
        allowedDays.includes(day)
      ) {
        assignedDays = [{ assignment_id: null, service_day: day }];
      }
    }

    const workDays = (workRows || []).map((r) => ({
      day_of_week: String(r.day_of_week),
      slots_total: r.slots_total == null ? null : Number(r.slots_total),
      slots_available: r.slots_available == null ? null : Number(r.slots_available),
      start_time: r.start_time || null,
      end_time: r.end_time || null,
      assigned: assignedDays.some((a) => a.service_day === String(r.day_of_week))
    }));

    res.json({
      client_id: clientId,
      school_organization_id: schoolId,
      provider: {
        provider_user_id: providerUserId,
        first_name: provider.first_name || '',
        last_name: provider.last_name || ''
      },
      work_days: workDays,
      assigned_days: assignedDays.map((a) => a.service_day)
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Toggle a client's assigned service day for a provider (slot-safe).
 * When assigning, also ensures the provider appears on that school day and returns soft-schedule open slots.
 * POST /api/school-portal/:schoolId/clients/:clientId/assigned-day
 * body: { providerUserId, serviceDay, assigned: true|false }
 */
export const setClientAssignedDay = async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const schoolId = parseInt(req.params.schoolId, 10);
    const clientId = parseInt(req.params.clientId, 10);
    const providerUserId = parseInt(req.body?.providerUserId ?? req.body?.provider_user_id, 10);
    const serviceDay = normalizeDay(req.body?.serviceDay ?? req.body?.service_day);
    const assigned =
      req.body?.assigned === true ||
      req.body?.assigned === 1 ||
      req.body?.assigned === '1' ||
      req.body?.assigned === 'true';

    if (!schoolId || !clientId || !providerUserId || !serviceDay) {
      return res.status(400).json({
        error: { message: 'schoolId, clientId, providerUserId, and a valid serviceDay are required' }
      });
    }

    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) {
      return res.status(access.status).json({ error: { message: access.message } });
    }
    if (!canEditClientAssignedDay(req, providerUserId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const providerAllowed = await ensureSupervisorCanAccessProvider({ req, access, providerUserId });
    if (!providerAllowed) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const affiliated = await ensureClientAffiliatedToSchool({ clientId, schoolId });
    if (!affiliated.ok) {
      return res.status(404).json({ error: { message: 'Client is not affiliated with this school' } });
    }

    const actorUserId = req.user?.id || null;

    if (assigned) {
      const onDay = await ensureProviderOnSchoolDay({
        schoolId,
        weekday: serviceDay,
        providerUserId,
        actorUserId
      });
      if (!onDay.ok) {
        return res.status(409).json({ error: { message: onDay.message } });
      }
    }

    await connection.beginTransaction();

    let existing = null;
    try {
      const [rows] = await connection.execute(
        `SELECT id, service_day, is_active
         FROM client_provider_assignments
         WHERE client_id = ? AND organization_id = ? AND provider_user_id = ?
           AND service_day = ? AND is_active = TRUE
         LIMIT 1
         FOR UPDATE`,
        [clientId, schoolId, providerUserId, serviceDay]
      );
      existing = rows?.[0] || null;
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) throw e;
    }

    if (assigned) {
      if (!existing) {
        // Prefer converting a single Unknown/null-day row into this weekday.
        let nullDayRow = null;
        try {
          const [nullRows] = await connection.execute(
            `SELECT id, service_day
             FROM client_provider_assignments
             WHERE client_id = ? AND organization_id = ? AND provider_user_id = ?
               AND is_active = TRUE AND service_day IS NULL
             LIMIT 1
             FOR UPDATE`,
            [clientId, schoolId, providerUserId]
          );
          nullDayRow = nullRows?.[0] || null;
        } catch {
          nullDayRow = null;
        }

        const take = await adjustProviderSlots(connection, {
          providerUserId,
          schoolId,
          dayOfWeek: serviceDay,
          delta: -1,
          allowNegative: false
        });
        if (!take.ok) {
          await connection.rollback();
          return res.status(400).json({ error: { message: take.reason || 'No available slots for that day' } });
        }

        if (nullDayRow?.id) {
          await connection.execute(
            `UPDATE client_provider_assignments
             SET service_day = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [serviceDay, actorUserId, nullDayRow.id]
          );
        } else {
          await connection.execute(
            `INSERT INTO client_provider_assignments
              (client_id, organization_id, provider_user_id, service_day, is_active, created_by_user_id, updated_by_user_id)
             VALUES (?, ?, ?, ?, TRUE, ?, ?)`,
            [clientId, schoolId, providerUserId, serviceDay, actorUserId, actorUserId]
          );
        }

        // Best-effort legacy sync when this is the only active assignment for the client at this org.
        try {
          const [cntRows] = await connection.execute(
            `SELECT COUNT(*) AS cnt
             FROM client_provider_assignments
             WHERE client_id = ? AND organization_id = ? AND is_active = TRUE`,
            [clientId, schoolId]
          );
          if (Number(cntRows?.[0]?.cnt || 0) <= 1) {
            await connection.execute(
              `UPDATE clients
               SET provider_id = ?, service_day = ?, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [providerUserId, serviceDay, actorUserId, clientId]
            );
          }
        } catch {
          // ignore
        }
      }
    } else if (existing?.id) {
      await adjustProviderSlots(connection, {
        providerUserId,
        schoolId,
        dayOfWeek: serviceDay,
        delta: +1
      });
      await connection.execute(
        `UPDATE client_provider_assignments
         SET is_active = FALSE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [actorUserId, existing.id]
      );
      try {
        await connection.execute(
          `UPDATE soft_schedule_slots
           SET client_id = NULL, updated_by_user_id = ?
           WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ? AND client_id = ?`,
          [actorUserId, schoolId, serviceDay, providerUserId, clientId]
        );
      } catch {
        // ignore if soft schedule table missing
      }
    }

    await connection.commit();

    let soft = { persisted: false, slots: [] };
    if (assigned) {
      soft = await loadSoftSlotsOrDefaults({ schoolId, weekday: serviceDay, providerUserId });
    }

    const openSlots = (soft.slots || []).filter((s) => !s.client_id);

    // Refresh assigned days list for UI
    let assignedDays = [];
    try {
      const [aRows] = await pool.execute(
        `SELECT service_day
         FROM client_provider_assignments
         WHERE client_id = ? AND organization_id = ? AND provider_user_id = ?
           AND is_active = TRUE AND service_day IS NOT NULL`,
        [clientId, schoolId, providerUserId]
      );
      assignedDays = (aRows || [])
        .map((r) => String(r.service_day))
        .filter((d) => allowedDays.includes(d));
    } catch {
      assignedDays = assigned ? [serviceDay] : [];
    }

    res.json({
      ok: true,
      assigned,
      service_day: serviceDay,
      assigned_days: assignedDays,
      soft_schedule: soft,
      open_slots: openSlots
    });
  } catch (e) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    next(e);
  } finally {
    connection.release();
  }
};

/**
 * Place a client into an open soft-schedule slot (after day assignment).
 * POST /api/school-portal/:schoolId/clients/:clientId/place-in-open-slot
 * body: { providerUserId, serviceDay, slotIndex? } — uses first open slot if slotIndex omitted
 */
export const placeClientInOpenSoftSlot = async (req, res, next) => {
  try {
    const schoolId = parseInt(req.params.schoolId, 10);
    const clientId = parseInt(req.params.clientId, 10);
    const providerUserId = parseInt(req.body?.providerUserId ?? req.body?.provider_user_id, 10);
    const serviceDay = normalizeDay(req.body?.serviceDay ?? req.body?.service_day);
    const requestedIndex = req.body?.slotIndex != null ? parseInt(req.body.slotIndex, 10) : null;

    if (!schoolId || !clientId || !providerUserId || !serviceDay) {
      return res.status(400).json({
        error: { message: 'schoolId, clientId, providerUserId, and a valid serviceDay are required' }
      });
    }

    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (!canEditClientAssignedDay(req, providerUserId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const onDay = await ensureProviderOnSchoolDay({
      schoolId,
      weekday: serviceDay,
      providerUserId,
      actorUserId: req.user?.id
    });
    if (!onDay.ok) return res.status(409).json({ error: { message: onDay.message } });

    // Client must be assigned to this provider/day.
    let eligible = false;
    try {
      const [rows] = await pool.execute(
        `SELECT 1 AS ok
         FROM client_provider_assignments
         WHERE client_id = ? AND organization_id = ? AND provider_user_id = ?
           AND service_day = ? AND is_active = TRUE
         LIMIT 1`,
        [clientId, schoolId, providerUserId, serviceDay]
      );
      eligible = !!rows?.[0];
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) throw e;
    }
    if (!eligible) {
      const [legacy] = await pool.execute(
        `SELECT provider_id, service_day, organization_id FROM clients WHERE id = ? LIMIT 1`,
        [clientId]
      );
      const c = legacy?.[0];
      eligible =
        !!c &&
        parseInt(c.organization_id, 10) === schoolId &&
        parseInt(c.provider_id || 0, 10) === providerUserId &&
        String(c.service_day || '') === serviceDay;
    }
    if (!eligible) {
      return res.status(409).json({
        error: { message: 'Client is not assigned to this provider/day yet.' }
      });
    }

    const soft = await loadSoftSlotsOrDefaults({ schoolId, weekday: serviceDay, providerUserId });
    const slots = (soft.slots || []).map((s) => ({
      id: s.id || null,
      start_time: s.start_time || null,
      end_time: s.end_time || null,
      note: s.note || null,
      client_id: s.client_id == null ? null : Number(s.client_id)
    }));

    // If client already placed, treat as success.
    if (slots.some((s) => Number(s.client_id) === clientId)) {
      return res.json({ ok: true, already_placed: true, slots });
    }

    let targetIdx = -1;
    if (requestedIndex != null && Number.isFinite(requestedIndex)) {
      const i = requestedIndex - 1;
      if (i >= 0 && i < slots.length && !slots[i].client_id) targetIdx = i;
    }
    if (targetIdx < 0) {
      targetIdx = slots.findIndex((s) => !s.client_id);
    }
    if (targetIdx < 0) {
      return res.status(409).json({ error: { message: 'No open soft-schedule slots for that day' } });
    }

    slots[targetIdx] = { ...slots[targetIdx], client_id: clientId };

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existingRows] = await connection.execute(
        `SELECT id
         FROM soft_schedule_slots
         WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?
         FOR UPDATE`,
        [schoolId, serviceDay, providerUserId]
      );
      const existingIds = new Set((existingRows || []).map((r) => Number(r.id)));
      const keptIds = new Set();

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const slotIndex = i + 1;
        const isExisting = slot.id && existingIds.has(Number(slot.id));
        if (isExisting) {
          await connection.execute(
            `UPDATE soft_schedule_slots
             SET slot_index = ?, start_time = ?, end_time = ?, client_id = ?, note = ?, updated_by_user_id = ?
             WHERE id = ?`,
            [slotIndex, slot.start_time, slot.end_time, slot.client_id, slot.note, req.user.id, slot.id]
          );
          keptIds.add(Number(slot.id));
        } else {
          const [ins] = await connection.execute(
            `INSERT INTO soft_schedule_slots
              (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              schoolId,
              serviceDay,
              providerUserId,
              slotIndex,
              slot.start_time,
              slot.end_time,
              slot.client_id,
              slot.note,
              req.user.id,
              req.user.id
            ]
          );
          keptIds.add(Number(ins.insertId));
        }
      }

      const toDelete = Array.from(existingIds).filter((id) => !keptIds.has(id));
      if (toDelete.length > 0) {
        const placeholders = toDelete.map(() => '?').join(',');
        await connection.execute(
          `DELETE FROM soft_schedule_slots WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ? AND id IN (${placeholders})`,
          [schoolId, serviceDay, providerUserId, ...toDelete]
        );
      }

      await connection.commit();
      const [outRows] = await pool.execute(
        `SELECT id, slot_index, start_time, end_time, client_id, note
         FROM soft_schedule_slots
         WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?
         ORDER BY slot_index ASC`,
        [schoolId, serviceDay, providerUserId]
      );
      res.json({
        ok: true,
        already_placed: false,
        slot_index: targetIdx + 1,
        slots: outRows || []
      });
    } catch (e) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      throw e;
    } finally {
      connection.release();
    }
  } catch (e) {
    next(e);
  }
};

