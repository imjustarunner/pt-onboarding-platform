import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { supervisorHasSuperviseeInSchool } from '../utils/supervisorSchoolAccess.js';

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
      if (role === 'supervisor') {
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
    const providerOnlyUserId = role === 'provider' ? parseInt(req.user?.id || 0, 10) : null;

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

    const out = (rows || []).map((r) => {
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
      const [clientRows] = await connection.execute(
        `SELECT id, organization_id, provider_id, service_day
         FROM clients
         WHERE id IN (${placeholders})`,
        unique
      );
      const byId = new Map((clientRows || []).map((r) => [Number(r.id), r]));
      for (const cid of unique) {
        const c = byId.get(Number(cid));
        if (!c) throw Object.assign(new Error('Client not found'), { status: 404 });
        if (parseInt(c.organization_id, 10) !== parseInt(schoolId, 10)) {
          throw Object.assign(new Error('Client does not belong to this school organization'), { status: 400 });
        }
        if (parseInt(c.provider_id || 0, 10) !== parseInt(providerUserId, 10) || String(c.service_day || '') !== String(weekday)) {
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

