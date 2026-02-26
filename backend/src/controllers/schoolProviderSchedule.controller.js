import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import { adjustProviderSlots } from '../services/providerSlots.service.js';
import { getLeaveInfoForUserIds } from '../services/leaveOfAbsence.service.js';
import { notifyClientBecameCurrent } from '../services/clientNotifications.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
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

async function ensureSupervisorCanAccessProvider({ req, access, providerId }) {
  if (!access?.supervisorLimited) return true;
  const superviseeIds = await getSupervisorSuperviseeIds(req.user?.id, null);
  const allowed = (superviseeIds || []).some((id) => parseInt(id, 10) === parseInt(providerId, 10));
  return !!allowed;
}

function buildOverlapWarnings(entries, startTime, endTime, excludeId = null) {
  const warnings = [];
  if (!startTime || !endTime) return warnings;

  const overlaps = (entries || []).filter((e) => {
    if (excludeId && parseInt(e.id, 10) === parseInt(excludeId, 10)) return false;
    return String(e.start_time) < String(endTime) && String(e.end_time) > String(startTime);
  });

  if (overlaps.length > 0) {
    warnings.push({
      code: 'overlap',
      message: `This time overlaps ${overlaps.length} other scheduled item(s) for this provider.`,
      details: overlaps.slice(0, 5).map((o) => ({ id: o.id, client_id: o.client_id, start_time: o.start_time, end_time: o.end_time }))
    });
  }

  return warnings;
}

async function buildOutsideHoursWarning({ providerUserId, schoolId, dayOfWeek, startTime, endTime }) {
  const warnings = [];
  if (!startTime || !endTime) return warnings;
  const [rows] = await pool.execute(
    `SELECT start_time, end_time
     FROM provider_school_assignments
     WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ? AND is_active = TRUE
     LIMIT 1`,
    [parseInt(providerUserId, 10), parseInt(schoolId, 10), String(dayOfWeek)]
  );
  const row = rows?.[0];
  if (!row?.start_time || !row?.end_time) return warnings;
  if (String(startTime) < String(row.start_time) || String(endTime) > String(row.end_time)) {
    warnings.push({
      code: 'outside_assigned_hours',
      message: `This time is outside the provider’s assigned hours for that day (${row.start_time}–${row.end_time}).`
    });
  }
  return warnings;
}

export const listSchoolProvidersForScheduling = async (req, res, next) => {
  try {
    const { schoolId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Optional columns (backward compatible):
    // - users.provider_accepting_new_clients
    // - provider_school_assignments.accepting_new_clients_override
    let rows = [];
    try {
      const [r] = await pool.execute(
        `SELECT psa.provider_user_id,
                u.first_name,
                u.last_name,
                u.email,
                COALESCE(psa.accepting_new_clients_override, u.provider_accepting_new_clients, TRUE) AS accepting_new_clients_effective,
                u.provider_accepting_new_clients AS provider_accepting_new_clients,
                psa.accepting_new_clients_override,
                psa.day_of_week,
                psa.slots_total,
                psa.slots_available,
                psa.start_time,
                psa.end_time,
                psa.is_active,
                COALESCE(u.provider_school_info_blurb, psp.school_info_blurb) AS school_info_blurb
         FROM provider_school_assignments psa
         JOIN users u ON u.id = psa.provider_user_id
         JOIN user_agencies ua
           ON ua.user_id = psa.provider_user_id
          AND ua.agency_id = psa.school_organization_id
         LEFT JOIN provider_school_profiles psp
           ON psp.school_organization_id = psa.school_organization_id
          AND psp.provider_user_id = psa.provider_user_id
         WHERE psa.school_organization_id = ? AND psa.is_active = TRUE
         ORDER BY u.last_name ASC, u.first_name ASC, psa.day_of_week ASC`,
        [parseInt(schoolId, 10)]
      );
      rows = r || [];
    } catch (e) {
      // Older DB: fall back without the optional columns.
      const msg = String(e?.message || '');
      const canFallback = msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR') || msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!canFallback) throw e;

      try {
        const [r2] = await pool.execute(
          `SELECT psa.provider_user_id,
                  u.first_name,
                  u.last_name,
                  u.email,
                  psa.day_of_week,
                  psa.slots_total,
                  psa.slots_available,
                  psa.start_time,
                  psa.end_time,
                  psa.is_active,
                  psp.school_info_blurb
           FROM provider_school_assignments psa
           JOIN users u ON u.id = psa.provider_user_id
           JOIN user_agencies ua
             ON ua.user_id = psa.provider_user_id
            AND ua.agency_id = psa.school_organization_id
           LEFT JOIN provider_school_profiles psp
             ON psp.school_organization_id = psa.school_organization_id
            AND psp.provider_user_id = psa.provider_user_id
           WHERE psa.school_organization_id = ? AND psa.is_active = TRUE
           ORDER BY u.last_name ASC, u.first_name ASC, psa.day_of_week ASC`,
          [parseInt(schoolId, 10)]
        );
        rows = (r2 || []).map((x) => ({
          ...x,
          accepting_new_clients_effective: true,
          provider_accepting_new_clients: true,
          accepting_new_clients_override: null
        }));
      } catch (e2) {
        const msg2 = String(e2?.message || '');
        const missingProfiles = msg2.includes("doesn't exist") || msg2.includes('ER_NO_SUCH_TABLE');
        if (!missingProfiles) throw e2;
        const [r3] = await pool.execute(
          `SELECT psa.provider_user_id,
                  u.first_name,
                  u.last_name,
                  u.email,
                  psa.day_of_week,
                  psa.slots_total,
                  psa.slots_available,
                  psa.start_time,
                  psa.end_time,
                  psa.is_active
           FROM provider_school_assignments psa
           JOIN users u ON u.id = psa.provider_user_id
           JOIN user_agencies ua
             ON ua.user_id = psa.provider_user_id
            AND ua.agency_id = psa.school_organization_id
           WHERE psa.school_organization_id = ? AND psa.is_active = TRUE
           ORDER BY u.last_name ASC, u.first_name ASC, psa.day_of_week ASC`,
          [parseInt(schoolId, 10)]
        );
        rows = (r3 || []).map((x) => ({
          ...x,
          school_info_blurb: null,
          accepting_new_clients_effective: true,
          provider_accepting_new_clients: true,
          accepting_new_clients_override: null
        }));
      }
    }

    // group by provider
    const byProvider = new Map();
    for (const r of rows || []) {
      const pid = r.provider_user_id;
      if (!byProvider.has(pid)) {
        byProvider.set(pid, {
          provider_user_id: pid,
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          accepting_new_clients: r.accepting_new_clients_effective !== undefined ? !!r.accepting_new_clients_effective : true,
          provider_accepting_new_clients: r.provider_accepting_new_clients !== undefined ? !!r.provider_accepting_new_clients : true,
          profile_photo_url: null,
          school_info_blurb: r.school_info_blurb || null,
          assignments: []
        });
      }
      byProvider.get(pid).assignments.push({
        day_of_week: r.day_of_week,
        slots_total: r.slots_total,
        slots_available: r.slots_available,
        start_time: r.start_time,
        end_time: r.end_time,
        is_active: !!r.is_active,
        accepting_new_clients_override: r.accepting_new_clients_override === null || r.accepting_new_clients_override === undefined
          ? null
          : !!r.accepting_new_clients_override,
        accepting_new_clients_effective: r.accepting_new_clients_effective !== undefined ? !!r.accepting_new_clients_effective : true
      });
    }

    // Best-effort: compute slots_used from actual assigned clients (for badge correctness),
    // including legacy clients.provider_id assignments without double-counting clients that
    // already have a matching client_provider_assignments row.
    try {
      const providerIds = Array.from(byProvider.keys()).map((v) => parseInt(v, 10)).filter(Boolean);
      if (providerIds.length > 0) {
        const orgId = parseInt(schoolId, 10);
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const p = providerIds.map(() => '?').join(',');
        const d = days.map(() => '?').join(',');

        const usedMap = new Map(); // "pid:day" -> used
        const inc = (pid, day, delta) => {
          const key = `${Number(pid)}:${String(day)}`;
          usedMap.set(key, (usedMap.get(key) || 0) + Number(delta || 0));
        };

        try {
          const [cpaCounts] = await pool.execute(
            `SELECT cpa.provider_user_id, cpa.service_day, COUNT(*) AS cnt
             FROM client_provider_assignments cpa
             WHERE cpa.organization_id = ?
               AND cpa.is_active = TRUE
               AND cpa.provider_user_id IN (${p})
               AND cpa.service_day IN (${d})
             GROUP BY cpa.provider_user_id, cpa.service_day`,
            [orgId, ...providerIds, ...days]
          );
          for (const r of cpaCounts || []) inc(r.provider_user_id, r.service_day, r.cnt);

          const [legacyCounts] = await pool.execute(
            `SELECT c.provider_id AS provider_user_id, c.service_day, COUNT(*) AS cnt
             FROM clients c
             LEFT JOIN client_provider_assignments cpa
               ON cpa.organization_id = c.organization_id
              AND cpa.client_id = c.id
              AND cpa.provider_user_id = c.provider_id
              AND cpa.service_day = c.service_day
              AND cpa.is_active = TRUE
             WHERE c.organization_id = ?
               AND c.provider_id IN (${p})
               AND c.service_day IN (${d})
               AND cpa.client_id IS NULL
             GROUP BY c.provider_id, c.service_day`,
            [orgId, ...providerIds, ...days]
          );
          for (const r of legacyCounts || []) inc(r.provider_user_id, r.service_day, r.cnt);
        } catch (e) {
          const msg = String(e?.message || '');
          const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
          if (!missing) throw e;

          const [legacyCounts] = await pool.execute(
            `SELECT c.provider_id AS provider_user_id, c.service_day, COUNT(*) AS cnt
             FROM clients c
             WHERE c.organization_id = ?
               AND c.provider_id IN (${p})
               AND c.service_day IN (${d})
             GROUP BY c.provider_id, c.service_day`,
            [orgId, ...providerIds, ...days]
          );
          for (const r of legacyCounts || []) inc(r.provider_user_id, r.service_day, r.cnt);
        }

        // Attach calculated used/available to each assignment row.
        for (const obj of byProvider.values()) {
          const pid = Number(obj.provider_user_id);
          obj.assignments = (obj.assignments || []).map((a) => {
            const day = String(a.day_of_week || '');
            const used = usedMap.get(`${pid}:${day}`) || 0;
            const total = Number(a.slots_total);
            const totalOk = Number.isFinite(total) && total > 0;
            const availCalc = totalOk ? Math.max(0, total - used) : null;
            return {
              ...a,
              slots_used: used,
              slots_available_calculated: availCalc
            };
          });
        }
      }
    } catch {
      // ignore (we still return the base assignments)
    }

    // Best-effort: attach provider profile photo URLs if column exists.
    try {
      const providerIds = Array.from(byProvider.keys()).map((v) => parseInt(v, 10)).filter(Boolean);
      if (providerIds.length > 0) {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [cols] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_photo_path' LIMIT 1",
          [dbName]
        );
        const hasCol = (cols || []).length > 0;
        if (hasCol) {
          const placeholders = providerIds.map(() => '?').join(',');
          const [pRows] = await pool.execute(
            `SELECT id, profile_photo_path FROM users WHERE id IN (${placeholders})`,
            providerIds
          );
          const byId = new Map((pRows || []).map((x) => [Number(x.id), x.profile_photo_path]));
          for (const [pid, obj] of byProvider.entries()) {
            const stored = byId.get(Number(pid)) || null;
            obj.profile_photo_url = publicUploadsUrlFromStoredPath(stored);
          }
        }
      }
    } catch {
      // ignore
    }

    // Attach leave-of-absence info for display (e.g. "Maternity leave", "On leave").
    try {
      const providerIds = Array.from(byProvider.keys()).map((v) => parseInt(v, 10)).filter(Boolean);
      if (providerIds.length > 0) {
        const leaveMap = await getLeaveInfoForUserIds(providerIds);
        for (const [pid, obj] of byProvider.entries()) {
          const leave = leaveMap.get(Number(pid)) || null;
          obj.leaveType = leave?.leaveType ?? null;
          obj.isOnLeave = leave?.isOnLeave ?? false;
          obj.leaveLabel = leave?.leaveLabel ?? null;
        }
      }
    } catch {
      // ignore
    }

    const providers = Array.from(byProvider.values());
    if (access.supervisorLimited) {
      const superviseeIds = new Set(await getSupervisorSuperviseeIds(req.user?.id, null));
      return res.json(providers.filter((p) => superviseeIds.has(Number(p.provider_user_id))));
    }
    res.json(providers);
  } catch (e) {
    next(e);
  }
};

export const listAssignedClientsForProviderDay = async (req, res, next) => {
  try {
    const { schoolId, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const providerAllowed = await ensureSupervisorCanAccessProvider({ req, access, providerId });
    if (!providerAllowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const dayOfWeek = normalizeDay(req.query.dayOfWeek);
    if (!dayOfWeek) return res.status(400).json({ error: { message: `dayOfWeek is required (${allowedDays.join(', ')})` } });

    // Return restricted fields only (school portal).
    const [rows] = await pool.execute(
      `SELECT id, initials, identifier_code, status, document_status, provider_id, service_day
       FROM clients
       WHERE organization_id = ?
         AND provider_id = ?
         AND service_day = ?
       ORDER BY initials ASC`,
      [parseInt(schoolId, 10), parseInt(providerId, 10), dayOfWeek]
    );

    // Unread note counts (per user) - best effort if table exists.
    const out = rows || [];
    try {
      const userId = req.user?.id;
      const clientIds = out.map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && userId) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [unreadRows] = await pool.execute(
          `SELECT n.client_id, COUNT(*) AS unread_count
           FROM client_notes n
           LEFT JOIN client_note_reads r
             ON r.client_id = n.client_id AND r.user_id = ?
           WHERE n.client_id IN (${placeholders})
             AND n.is_internal_only = FALSE
             AND n.created_at > COALESCE(r.last_read_at, '1970-01-01')
           GROUP BY n.client_id`,
          [userId, ...clientIds]
        );
        const m = new Map();
        for (const r of unreadRows || []) m.set(Number(r.client_id), Number(r.unread_count || 0));
        for (const c of out) c.unread_notes_count = m.get(Number(c.id)) || 0;
      }
    } catch {
      // ignore
    }

    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const listScheduleEntries = async (req, res, next) => {
  try {
    const { schoolId, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const providerAllowed = await ensureSupervisorCanAccessProvider({ req, access, providerId });
    if (!providerAllowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const dayOfWeek = normalizeDay(req.query.dayOfWeek);
    if (!dayOfWeek) return res.status(400).json({ error: { message: `dayOfWeek is required (${allowedDays.join(', ')})` } });

    const [rows] = await pool.execute(
      `SELECT e.*,
              c.initials AS client_initials
       FROM school_provider_schedule_entries e
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.school_organization_id = ? AND e.provider_user_id = ? AND e.day_of_week = ?
       ORDER BY e.sort_order ASC, e.start_time ASC, e.end_time ASC, e.id ASC`,
      [parseInt(schoolId, 10), parseInt(providerId, 10), dayOfWeek]
    );

    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const createScheduleEntry = async (req, res, next) => {
  try {
    const { schoolId, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (access.supervisorLimited) return res.status(403).json({ error: { message: 'Supervisors have read-only schedule access' } });

    const dayOfWeek = normalizeDay(req.body?.dayOfWeek);
    const clientId = parseInt(req.body?.clientId, 10);
    const startTime = req.body?.startTime;
    const endTime = req.body?.endTime;
    const room = req.body?.room ?? null;
    const teacher = req.body?.teacher ?? null;
    const notes = req.body?.notes ?? null;

    if (!dayOfWeek || !clientId || !startTime || !endTime) {
      return res.status(400).json({ error: { message: 'dayOfWeek, clientId, startTime, endTime are required' } });
    }

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    if (parseInt(client.organization_id, 10) !== parseInt(schoolId, 10)) {
      return res.status(400).json({ error: { message: 'Client does not belong to this school organization' } });
    }
    // Schedule entries are for logistics only; client must already be assigned to this provider/day.
    if (parseInt(client.provider_id || 0, 10) !== parseInt(providerId, 10) || String(client.service_day || '') !== String(dayOfWeek)) {
      return res.status(409).json({ error: { message: 'Client is not assigned to this provider/day. Assign first, then schedule.' } });
    }

    // Best-effort sort order: append to end of list (requires migration 199).
    let sortOrder = 0;
    try {
      const [m] = await pool.execute(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_sort
         FROM school_provider_schedule_entries
         WHERE school_organization_id = ? AND provider_user_id = ? AND day_of_week = ?`,
        [parseInt(schoolId, 10), parseInt(providerId, 10), dayOfWeek]
      );
      sortOrder = Number(m?.[0]?.max_sort || 0) + 1;
    } catch {
      sortOrder = 0;
    }

    const [result] = await pool.execute(
      `INSERT INTO school_provider_schedule_entries
        (school_organization_id, provider_user_id, day_of_week, client_id, sort_order, start_time, end_time, room, teacher, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(schoolId, 10),
        parseInt(providerId, 10),
        dayOfWeek,
        clientId,
        sortOrder,
        startTime,
        endTime,
        room ? String(room).trim() : null,
        teacher ? String(teacher).trim() : null,
        notes ? String(notes) : null,
        req.user.id
      ]
    );

    const [rows] = await pool.execute(`SELECT * FROM school_provider_schedule_entries WHERE id = ?`, [result.insertId]);
    const entry = rows?.[0] || null;

    // Warnings (non-blocking)
    const [siblings] = await pool.execute(
      `SELECT id, client_id, start_time, end_time
       FROM school_provider_schedule_entries
       WHERE school_organization_id = ? AND provider_user_id = ? AND day_of_week = ?`,
      [parseInt(schoolId, 10), parseInt(providerId, 10), dayOfWeek]
    );
    const warnings = [
      ...buildOverlapWarnings(siblings, startTime, endTime, entry?.id),
      ...(await buildOutsideHoursWarning({ providerUserId: providerId, schoolId, dayOfWeek, startTime, endTime }))
    ];

    res.status(201).json({ entry, warnings });
  } catch (e) {
    next(e);
  }
};

export const updateScheduleEntry = async (req, res, next) => {
  try {
    const { schoolId, providerId, entryId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (access.supervisorLimited) return res.status(403).json({ error: { message: 'Supervisors have read-only schedule access' } });

    const id = parseInt(entryId, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid entryId' } });

    const [existingRows] = await pool.execute(`SELECT * FROM school_provider_schedule_entries WHERE id = ? LIMIT 1`, [id]);
    const existing = existingRows?.[0];
    if (!existing) return res.status(404).json({ error: { message: 'Schedule entry not found' } });
    if (parseInt(existing.school_organization_id, 10) !== parseInt(schoolId, 10) || parseInt(existing.provider_user_id, 10) !== parseInt(providerId, 10)) {
      return res.status(403).json({ error: { message: 'Entry does not belong to this provider/school' } });
    }

    const nextClientId = req.body?.clientId !== undefined ? parseInt(req.body.clientId, 10) : existing.client_id;
    const startTime = req.body?.startTime !== undefined ? req.body.startTime : existing.start_time;
    const endTime = req.body?.endTime !== undefined ? req.body.endTime : existing.end_time;
    const room = req.body?.room !== undefined ? (req.body.room ? String(req.body.room).trim() : null) : existing.room;
    const teacher = req.body?.teacher !== undefined ? (req.body.teacher ? String(req.body.teacher).trim() : null) : existing.teacher;
    const notes = req.body?.notes !== undefined ? (req.body.notes ? String(req.body.notes) : null) : existing.notes;

    if (!nextClientId || !startTime || !endTime) {
      return res.status(400).json({ error: { message: 'clientId, startTime, endTime are required' } });
    }

    const client = await Client.findById(nextClientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    if (parseInt(client.organization_id, 10) !== parseInt(schoolId, 10)) {
      return res.status(400).json({ error: { message: 'Client does not belong to this school organization' } });
    }
    // Keep schedule entries aligned with assignments.
    if (parseInt(client.provider_id || 0, 10) !== parseInt(providerId, 10) || String(client.service_day || '') !== String(existing.day_of_week)) {
      return res.status(409).json({ error: { message: 'Client is not assigned to this provider/day. Assign first, then schedule.' } });
    }

    await pool.execute(
      `UPDATE school_provider_schedule_entries
       SET client_id = ?, start_time = ?, end_time = ?, room = ?, teacher = ?, notes = ?
       WHERE id = ?`,
      [nextClientId, startTime, endTime, room, teacher, notes, id]
    );

    const [rows] = await pool.execute(`SELECT * FROM school_provider_schedule_entries WHERE id = ?`, [id]);
    const entry = rows?.[0] || null;

    const [siblings] = await pool.execute(
      `SELECT id, client_id, start_time, end_time
       FROM school_provider_schedule_entries
       WHERE school_organization_id = ? AND provider_user_id = ? AND day_of_week = ?`,
      [parseInt(schoolId, 10), parseInt(providerId, 10), String(existing.day_of_week)]
    );
    const warnings = [
      ...buildOverlapWarnings(siblings, startTime, endTime, id),
      ...(await buildOutsideHoursWarning({ providerUserId: providerId, schoolId, dayOfWeek: existing.day_of_week, startTime, endTime }))
    ];

    res.json({ entry, warnings });
  } catch (e) {
    next(e);
  }
};

export const moveScheduleEntry = async (req, res, next) => {
  try {
    const { schoolId, providerId, entryId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (access.supervisorLimited) return res.status(403).json({ error: { message: 'Supervisors have read-only schedule access' } });

    const id = parseInt(entryId, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid entryId' } });

    const direction = String(req.body?.direction || '').trim().toLowerCase();
    if (direction !== 'up' && direction !== 'down') {
      return res.status(400).json({ error: { message: 'direction must be up or down' } });
    }

    const [existingRows] = await pool.execute(`SELECT * FROM school_provider_schedule_entries WHERE id = ? LIMIT 1`, [id]);
    const existing = existingRows?.[0];
    if (!existing) return res.status(404).json({ error: { message: 'Schedule entry not found' } });
    if (parseInt(existing.school_organization_id, 10) !== parseInt(schoolId, 10) || parseInt(existing.provider_user_id, 10) !== parseInt(providerId, 10)) {
      return res.status(403).json({ error: { message: 'Entry does not belong to this provider/school' } });
    }

    // Only allow move when sort_order exists; otherwise no-op.
    const currentSort = existing.sort_order !== undefined && existing.sort_order !== null ? Number(existing.sort_order) : 0;

    // Find neighbor by sort_order then id.
    let neighbor = null;
    try {
      if (direction === 'up') {
        const [rows] = await pool.execute(
          `SELECT id, sort_order
           FROM school_provider_schedule_entries
           WHERE school_organization_id = ? AND provider_user_id = ? AND day_of_week = ?
             AND (sort_order < ? OR (sort_order = ? AND id < ?))
           ORDER BY sort_order DESC, id DESC
           LIMIT 1`,
          [parseInt(schoolId, 10), parseInt(providerId, 10), String(existing.day_of_week), currentSort, currentSort, id]
        );
        neighbor = rows?.[0] || null;
      } else {
        const [rows] = await pool.execute(
          `SELECT id, sort_order
           FROM school_provider_schedule_entries
           WHERE school_organization_id = ? AND provider_user_id = ? AND day_of_week = ?
             AND (sort_order > ? OR (sort_order = ? AND id > ?))
           ORDER BY sort_order ASC, id ASC
           LIMIT 1`,
          [parseInt(schoolId, 10), parseInt(providerId, 10), String(existing.day_of_week), currentSort, currentSort, id]
        );
        neighbor = rows?.[0] || null;
      }
    } catch {
      neighbor = null;
    }

    if (!neighbor) {
      const [rows] = await pool.execute(
        `SELECT *
         FROM school_provider_schedule_entries
         WHERE school_organization_id = ? AND provider_user_id = ? AND day_of_week = ?
         ORDER BY sort_order ASC, start_time ASC, end_time ASC, id ASC`,
        [parseInt(schoolId, 10), parseInt(providerId, 10), String(existing.day_of_week)]
      );
      return res.json({ moved: false, entries: rows || [] });
    }

    const neighborSort = neighbor.sort_order !== undefined && neighbor.sort_order !== null ? Number(neighbor.sort_order) : currentSort;

    // Swap sort_order (and if equal, still swap by assigning +/- 1).
    let a = currentSort;
    let b = neighborSort;
    if (a === b) {
      if (direction === 'up') {
        a = currentSort - 1;
      } else {
        a = currentSort + 1;
      }
    }

    await pool.execute(`UPDATE school_provider_schedule_entries SET sort_order = ? WHERE id = ?`, [b, id]);
    await pool.execute(`UPDATE school_provider_schedule_entries SET sort_order = ? WHERE id = ?`, [a, neighbor.id]);

    const [rows] = await pool.execute(
      `SELECT e.*, c.initials AS client_initials
       FROM school_provider_schedule_entries e
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.school_organization_id = ? AND e.provider_user_id = ? AND e.day_of_week = ?
       ORDER BY e.sort_order ASC, e.start_time ASC, e.end_time ASC, e.id ASC`,
      [parseInt(schoolId, 10), parseInt(providerId, 10), String(existing.day_of_week)]
    );

    res.json({ moved: true, entries: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const deleteScheduleEntry = async (req, res, next) => {
  try {
    const { schoolId, providerId, entryId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (access.supervisorLimited) return res.status(403).json({ error: { message: 'Supervisors have read-only schedule access' } });

    const id = parseInt(entryId, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid entryId' } });

    const [existingRows] = await pool.execute(`SELECT id, school_organization_id, provider_user_id FROM school_provider_schedule_entries WHERE id = ? LIMIT 1`, [id]);
    const existing = existingRows?.[0];
    if (!existing) return res.status(404).json({ error: { message: 'Schedule entry not found' } });
    if (parseInt(existing.school_organization_id, 10) !== parseInt(schoolId, 10) || parseInt(existing.provider_user_id, 10) !== parseInt(providerId, 10)) {
      return res.status(403).json({ error: { message: 'Entry does not belong to this provider/school' } });
    }

    await pool.execute(`DELETE FROM school_provider_schedule_entries WHERE id = ?`, [id]);
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
};

/**
 * School-scoped provider assignment with slot safety.
 * POST /api/school-portal/:schoolId/clients/:clientId/assign-provider
 * Body: { providerUserId, serviceDay }
 */
// NOTE: Provider/day assignment from School Portal was intentionally removed.
// Assignments must be managed at the client level (roster -> edit client).

