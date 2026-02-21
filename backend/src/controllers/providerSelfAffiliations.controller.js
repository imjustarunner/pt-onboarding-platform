import pool from '../config/database.js';
import User from '../models/User.model.js';
import { syncSchoolPortalDayProvider } from '../services/schoolPortalDaySync.service.js';

const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const normalizeDay = (d) => {
  const s = String(d || '').trim();
  return allowedDays.includes(s) ? s : null;
};

const normalizeTime = (t) => {
  const s = String(t || '').trim();
  if (!s) return null;
  // Accept HH:MM or HH:MM:SS; store as HH:MM:SS for MySQL TIME.
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return null;
};

const minutesBetween = (startTime, endTime) => {
  const s = String(startTime || '').slice(0, 5);
  const e = String(endTime || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e)) return 0;
  const [sh, sm] = s.split(':').map((n) => parseInt(n, 10));
  const [eh, em] = e.split(':').map((n) => parseInt(n, 10));
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return 0;
  return (eh * 60 + em) - (sh * 60 + sm);
};

const autoSlotsFromTimes = (startTime, endTime) => {
  const mins = minutesBetween(startTime, endTime);
  if (!Number.isFinite(mins) || mins <= 0) return 0;
  // Default: 1 client per hour. If not a perfect hour boundary, round up.
  return Math.ceil(mins / 60);
};

async function resolveTargetProviderId(req) {
  const requested = req.query?.providerUserId ? parseInt(req.query.providerUserId, 10) : null;
  const requesterRole = String(req.user?.role || '').trim();
  const r = requesterRole.toLowerCase();
  const canActForOthers = r === 'admin' || r === 'super_admin' || r === 'support' || r === 'staff';

  const targetId = requested && canActForOthers ? requested : parseInt(req.user?.id, 10);
  if (!targetId) return { ok: false, status: 401, message: 'Not authenticated' };

  if (requested && requested !== targetId && !canActForOthers) {
    return { ok: false, status: 403, message: 'Access denied' };
  }

  const targetUser = await User.findById(targetId);
  if (!targetUser) return { ok: false, status: 404, message: 'Provider not found' };

  const role = String(targetUser.role || '').trim().toLowerCase();
  // "Provider-like" accounts can participate in provider-facing school affiliation + scheduling flows.
  // provider_plus, intern, intern_plus are assigned to schools and need school affiliation management.
  const providerLikeRoles = ['provider', 'provider_plus', 'intern', 'intern_plus', 'admin', 'super_admin', 'clinical_practice_assistant'];
  const isProviderLike = providerLikeRoles.includes(role) || Boolean(targetUser.has_provider_access);
  if (!isProviderLike) {
    return { ok: false, status: 400, message: 'User is not a provider' };
  }

  return { ok: true, providerUserId: targetId, provider: targetUser };
}

async function computeProviderUsedByDay({ connection, schoolId, providerUserId, days }) {
  const orgId = parseInt(schoolId, 10);
  const pid = parseInt(providerUserId, 10);
  const dayList = Array.isArray(days) ? days.map((d) => String(d || '').trim()).filter(Boolean) : [];
  const out = new Map();
  for (const d of dayList) out.set(d, 0);
  if (!orgId || !pid || dayList.length === 0) return out;

  const dPlaceholders = dayList.map(() => '?').join(',');
  try {
    const [cpaCounts] = await connection.execute(
      `SELECT cpa.service_day, COUNT(*) AS cnt
       FROM client_provider_assignments cpa
       WHERE cpa.organization_id = ?
         AND cpa.provider_user_id = ?
         AND cpa.is_active = TRUE
         AND cpa.service_day IN (${dPlaceholders})
       GROUP BY cpa.service_day`,
      [orgId, pid, ...dayList]
    );
    for (const r of cpaCounts || []) out.set(String(r.service_day), Number(r.cnt || 0));

    const [legacyCounts] = await connection.execute(
      `SELECT c.service_day, COUNT(*) AS cnt
       FROM clients c
       LEFT JOIN client_provider_assignments cpa
         ON cpa.organization_id = c.organization_id
        AND cpa.client_id = c.id
        AND cpa.provider_user_id = c.provider_id
        AND cpa.service_day = c.service_day
        AND cpa.is_active = TRUE
       WHERE c.organization_id = ?
         AND c.provider_id = ?
         AND c.service_day IN (${dPlaceholders})
         AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
         AND cpa.client_id IS NULL
       GROUP BY c.service_day`,
      [orgId, pid, ...dayList]
    );
    for (const r of legacyCounts || []) out.set(String(r.service_day), (out.get(String(r.service_day)) || 0) + Number(r.cnt || 0));
    return out;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (!missing) throw e;
    const [legacyCounts] = await connection.execute(
      `SELECT c.service_day, COUNT(*) AS cnt
       FROM clients c
       WHERE c.organization_id = ?
         AND c.provider_id = ?
         AND c.service_day IN (${dPlaceholders})
         AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
       GROUP BY c.service_day`,
      [orgId, pid, ...dayList]
    );
    for (const r of legacyCounts || []) out.set(String(r.service_day), Number(r.cnt || 0));
    return out;
  }
}

export const repairProviderSchoolSlots = async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { schoolId } = req.params;
    const target = await resolveTargetProviderId(req);
    if (!target.ok) return res.status(target.status).json({ error: { message: target.message } });

    // Only backoffice roles should run repairs.
    const actorRole = String(req.user?.role || '').toLowerCase();
    if (!['super_admin', 'admin', 'staff'].includes(actorRole)) {
      return res.status(403).json({ error: { message: 'Admin/staff access required' } });
    }

    const aff = await ensureSchoolAffiliation(req, target.providerUserId, schoolId);
    if (!aff.ok) return res.status(aff.status).json({ error: { message: aff.message } });

    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, day_of_week, slots_total, slots_available
       FROM provider_school_assignments
       WHERE provider_user_id = ? AND school_organization_id = ?
       FOR UPDATE`,
      [target.providerUserId, aff.schoolId]
    );

    if (!rows || rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: { message: 'No school assignment rows found for this provider.' } });
    }

    const days = rows.map((r) => String(r.day_of_week || '')).filter(Boolean);
    const usedByDay = await computeProviderUsedByDay({
      connection,
      schoolId: aff.schoolId,
      providerUserId: target.providerUserId,
      days
    });

    const updated = [];
    for (const r of rows) {
      const day = String(r.day_of_week || '');
      const total = Number(r.slots_total ?? 0);
      const used = Number(usedByDay.get(day) || 0);
      // IMPORTANT: allow negative availability (overbooked).
      const nextAvail = Number.isFinite(total) ? (total - used) : null;
      if (nextAvail === null) continue;
      await connection.execute(`UPDATE provider_school_assignments SET slots_available = ? WHERE id = ?`, [nextAvail, r.id]);
      updated.push({
        id: r.id,
        day_of_week: day,
        slots_total: total,
        slots_used: used,
        slots_available_before: Number(r.slots_available ?? 0),
        slots_available_after: nextAvail
      });
    }

    await connection.commit();
    res.json({
      ok: true,
      providerUserId: target.providerUserId,
      schoolOrganizationId: aff.schoolId,
      updatedCount: updated.length,
      updated
    });
  } catch (e) {
    try { await connection.rollback(); } catch { /* ignore */ }
    next(e);
  } finally {
    connection.release();
  }
};

async function ensureSchoolAffiliation(req, providerUserId, schoolId) {
  const sid = parseInt(schoolId, 10);
  if (!sid) return { ok: false, status: 400, message: 'Invalid schoolId' };
  const orgs = await User.getAgencies(providerUserId);
  const allowed = (orgs || []).some((o) => parseInt(o.id, 10) === sid);
  if (!allowed) return { ok: false, status: 403, message: 'Provider is not affiliated with this organization' };
  return { ok: true, schoolId: sid, orgs };
}

export const listProviderAffiliations = async (req, res, next) => {
  try {
    const target = await resolveTargetProviderId(req);
    if (!target.ok) return res.status(target.status).json({ error: { message: target.message } });

    const orgs = await User.getAgencies(target.providerUserId);
    const affiliations = (orgs || [])
      .filter((o) => String(o.organization_type || 'agency').toLowerCase() !== 'agency')
      .map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug || null,
        organization_type: o.organization_type || 'agency',
        icon_file_path: o.icon_file_path || null,
        icon_name: o.icon_name || null
      }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    res.json({
      providerUserId: target.providerUserId,
      affiliations
    });
  } catch (e) {
    next(e);
  }
};

export const getProviderSchoolAssignments = async (req, res, next) => {
  try {
    const { schoolId } = req.params;
    const target = await resolveTargetProviderId(req);
    if (!target.ok) return res.status(target.status).json({ error: { message: target.message } });

    const aff = await ensureSchoolAffiliation(req, target.providerUserId, schoolId);
    if (!aff.ok) return res.status(aff.status).json({ error: { message: aff.message } });

    // School bell schedule / notes (school-level quick reference)
    let schoolBellSchedule = { startTime: null, endTime: null, notes: null };
    try {
      try {
        const [spRows] = await pool.execute(
          `SELECT bell_schedule_start_time, bell_schedule_end_time, school_days_times
           FROM school_profiles
           WHERE school_organization_id = ?
           LIMIT 1`,
          [aff.schoolId]
        );
        const sp = spRows?.[0] || null;
        schoolBellSchedule = {
          startTime: sp?.bell_schedule_start_time ?? null,
          endTime: sp?.bell_schedule_end_time ?? null,
          // Reuse existing "school_days_times" field as Notes (legacy Soft Schedule).
          notes: sp?.school_days_times ?? null
        };
      } catch (e) {
        // Backward-compatible: bell schedule columns may not exist yet.
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
        const [spRows] = await pool.execute(
          `SELECT school_days_times
           FROM school_profiles
           WHERE school_organization_id = ?
           LIMIT 1`,
          [aff.schoolId]
        );
        const sp = spRows?.[0] || null;
        schoolBellSchedule = { startTime: null, endTime: null, notes: sp?.school_days_times ?? null };
      }
    } catch {
      schoolBellSchedule = { startTime: null, endTime: null, notes: null };
    }

    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_school_assignments
       WHERE provider_user_id = ? AND school_organization_id = ?
       ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday') ASC`,
      [target.providerUserId, aff.schoolId]
    );

    // Best-effort: compute used + calculated availability from actual assignments so this view matches the School Portal.
    // This also makes it obvious when stored slots_available has drifted.
    let usedByDay = new Map();
    try {
      const orgId = parseInt(aff.schoolId, 10);
      const providerId = parseInt(target.providerUserId, 10);
      const days = allowedDays;
      for (const d of days) usedByDay.set(d, 0);
      if (orgId && providerId) {
        const dPlaceholders = days.map(() => '?').join(',');
        try {
          const [cpaCounts] = await pool.execute(
            `SELECT cpa.service_day, COUNT(*) AS cnt
             FROM client_provider_assignments cpa
             WHERE cpa.organization_id = ?
               AND cpa.provider_user_id = ?
               AND cpa.is_active = TRUE
               AND cpa.service_day IN (${dPlaceholders})
             GROUP BY cpa.service_day`,
            [orgId, providerId, ...days]
          );
          for (const r of cpaCounts || []) usedByDay.set(String(r.service_day), Number(r.cnt || 0));

          const [legacyCounts] = await pool.execute(
            `SELECT c.service_day, COUNT(*) AS cnt
             FROM clients c
             LEFT JOIN client_provider_assignments cpa
               ON cpa.organization_id = c.organization_id
              AND cpa.client_id = c.id
              AND cpa.provider_user_id = c.provider_id
              AND cpa.service_day = c.service_day
              AND cpa.is_active = TRUE
             WHERE c.organization_id = ?
               AND c.provider_id = ?
               AND c.service_day IN (${dPlaceholders})
               AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
               AND cpa.client_id IS NULL
             GROUP BY c.service_day`,
            [orgId, providerId, ...days]
          );
          for (const r of legacyCounts || []) usedByDay.set(String(r.service_day), (usedByDay.get(String(r.service_day)) || 0) + Number(r.cnt || 0));
        } catch (e) {
          const msg = String(e?.message || '');
          const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
          if (!missing) throw e;
          const [legacyCounts] = await pool.execute(
            `SELECT c.service_day, COUNT(*) AS cnt
             FROM clients c
             WHERE c.organization_id = ?
               AND c.provider_id = ?
               AND c.service_day IN (${dPlaceholders})
               AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
             GROUP BY c.service_day`,
            [orgId, providerId, ...days]
          );
          for (const r of legacyCounts || []) usedByDay.set(String(r.service_day), Number(r.cnt || 0));
        }
      }
    } catch {
      usedByDay = new Map();
    }

    const override = (rows || []).reduce((acc, r) => {
      if (acc !== undefined) return acc;
      if (r.accepting_new_clients_override === null || r.accepting_new_clients_override === undefined) return acc;
      return Boolean(r.accepting_new_clients_override);
    }, undefined);

    res.json({
      providerUserId: target.providerUserId,
      schoolOrganizationId: aff.schoolId,
      schoolBellSchedule,
      schoolAcceptingNewClientsOverride: override === undefined ? null : override,
      assignments: (rows || []).map((r) => {
        const day = String(r.day_of_week || '');
        const used = usedByDay.get(day);
        const total = Number(r.slots_total);
        const totalOk = Number.isFinite(total) && total >= 0;
        const availCalc = totalOk && Number.isFinite(used) ? Math.max(0, total - Number(used || 0)) : null;
        return {
          ...r,
          slots_used: Number.isFinite(used) ? Number(used || 0) : null,
          slots_available_calculated: availCalc
        };
      })
    });
  } catch (e) {
    next(e);
  }
};

export const upsertProviderSchoolAssignments = async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { schoolId } = req.params;
    const target = await resolveTargetProviderId(req);
    if (!target.ok) return res.status(target.status).json({ error: { message: target.message } });

    const aff = await ensureSchoolAffiliation(req, target.providerUserId, schoolId);
    if (!aff.ok) return res.status(aff.status).json({ error: { message: aff.message } });

    const days = Array.isArray(req.body?.days) ? req.body.days : [];
    const overrideRaw = req.body?.schoolAcceptingNewClientsOverride;
    const override =
      overrideRaw === undefined || overrideRaw === null || overrideRaw === ''
        ? null
        : (overrideRaw === true || overrideRaw === 'true' || overrideRaw === 1 || overrideRaw === '1');

    await connection.beginTransaction();

    // Load existing rows for used-slot preservation
    const [existingRows] = await connection.execute(
      `SELECT id, day_of_week, slots_total, slots_available, is_active
       FROM provider_school_assignments
       WHERE provider_user_id = ? AND school_organization_id = ?
       FOR UPDATE`,
      [target.providerUserId, aff.schoolId]
    );
    const byDay = new Map((existingRows || []).map((r) => [String(r.day_of_week), r]));

    for (const d of days) {
      const dayOfWeek = normalizeDay(d?.dayOfWeek);
      if (!dayOfWeek) {
        await connection.rollback();
        return res.status(400).json({ error: { message: `Invalid dayOfWeek (allowed: ${allowedDays.join(', ')})` } });
      }

      const isActive = d?.isActive === undefined ? true : Boolean(d.isActive);
      const startTime = normalizeTime(d?.startTime);
      const endTime = normalizeTime(d?.endTime);

      if ((startTime && !endTime) || (!startTime && endTime)) {
        await connection.rollback();
        return res.status(400).json({ error: { message: `Both startTime and endTime are required for ${dayOfWeek}` } });
      }
      if (startTime && endTime && minutesBetween(startTime, endTime) <= 0) {
        await connection.rollback();
        return res.status(400).json({ error: { message: `End time must be after start time for ${dayOfWeek}` } });
      }

      let slotsTotal = d?.slotsTotal;
      if (slotsTotal === undefined || slotsTotal === null || slotsTotal === '') {
        slotsTotal = startTime && endTime ? autoSlotsFromTimes(startTime, endTime) : 0;
      }
      slotsTotal = parseInt(slotsTotal, 10);
      if (!Number.isFinite(slotsTotal) || slotsTotal < 0) {
        await connection.rollback();
        return res.status(400).json({ error: { message: `slotsTotal must be a non-negative integer for ${dayOfWeek}` } });
      }

      const existing = byDay.get(dayOfWeek);
      if (!existing) {
        await connection.execute(
          `INSERT INTO provider_school_assignments
            (provider_user_id, school_organization_id, day_of_week, slots_total, slots_available, start_time, end_time, is_active, accepting_new_clients_override)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            target.providerUserId,
            aff.schoolId,
            dayOfWeek,
            slotsTotal,
            slotsTotal,
            startTime,
            endTime,
            isActive ? 1 : 0,
            override
          ]
        );

        // Keep School Portal weekday/provider rows in sync with provider work-hour config.
        await syncSchoolPortalDayProvider({
          executor: connection,
          schoolId: aff.schoolId,
          providerUserId: target.providerUserId,
          weekday: dayOfWeek,
          isActive,
          actorUserId: req.user.id
        });
        continue;
      }

      const oldTotal = parseInt(existing.slots_total ?? 0, 10);
      const oldAvail = parseInt(existing.slots_available ?? 0, 10);
      const used = Math.max(0, oldTotal - oldAvail);

      if (!isActive && used > 0) {
        await connection.rollback();
        return res.status(409).json({
          error: { message: `Cannot deactivate ${dayOfWeek}: ${used} client slot(s) are currently in use.` }
        });
      }

      const nextAvail = Math.max(0, slotsTotal - used);
      await connection.execute(
        `UPDATE provider_school_assignments
         SET slots_total = ?, slots_available = ?, start_time = ?, end_time = ?, is_active = ?, accepting_new_clients_override = ?
         WHERE id = ?`,
        [slotsTotal, nextAvail, startTime, endTime, isActive ? 1 : 0, override, existing.id]
      );

      // Keep School Portal weekday/provider rows in sync with provider work-hour config.
      await syncSchoolPortalDayProvider({
        executor: connection,
        schoolId: aff.schoolId,
        providerUserId: target.providerUserId,
        weekday: dayOfWeek,
        isActive,
        actorUserId: req.user.id
      });
    }

    // Propagate override across all days for this school/provider (treat as school-level)
    if (overrideRaw !== undefined) {
      await connection.execute(
        `UPDATE provider_school_assignments
         SET accepting_new_clients_override = ?
         WHERE provider_user_id = ? AND school_organization_id = ?`,
        [override, target.providerUserId, aff.schoolId]
      );
    }

    await connection.commit();

    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_school_assignments
       WHERE provider_user_id = ? AND school_organization_id = ?
       ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday') ASC`,
      [target.providerUserId, aff.schoolId]
    );

    const overrideOut = (rows || []).reduce((acc, r) => {
      if (acc !== undefined) return acc;
      if (r.accepting_new_clients_override === null || r.accepting_new_clients_override === undefined) return acc;
      return Boolean(r.accepting_new_clients_override);
    }, undefined);

    res.json({
      providerUserId: target.providerUserId,
      schoolOrganizationId: aff.schoolId,
      schoolAcceptingNewClientsOverride: overrideOut === undefined ? null : overrideOut,
      assignments: rows || []
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

