import pool from '../config/database.js';
import User from '../models/User.model.js';

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
  const canActForOthers = requesterRole === 'admin' || requesterRole === 'super_admin' || requesterRole === 'support';

  const targetId = requested && canActForOthers ? requested : parseInt(req.user?.id, 10);
  if (!targetId) return { ok: false, status: 401, message: 'Not authenticated' };

  if (requested && requested !== targetId && !canActForOthers) {
    return { ok: false, status: 403, message: 'Access denied' };
  }

  const targetUser = await User.findById(targetId);
  if (!targetUser) return { ok: false, status: 404, message: 'Provider not found' };

  const role = String(targetUser.role || '').trim().toLowerCase();
  const isProviderLike = role === 'provider' || Boolean(targetUser.has_provider_access);
  if (!isProviderLike) {
    return { ok: false, status: 400, message: 'User is not a provider' };
  }

  return { ok: true, providerUserId: targetId, provider: targetUser };
}

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

    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_school_assignments
       WHERE provider_user_id = ? AND school_organization_id = ?
       ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday') ASC`,
      [target.providerUserId, aff.schoolId]
    );

    const override = (rows || []).reduce((acc, r) => {
      if (acc !== undefined) return acc;
      if (r.accepting_new_clients_override === null || r.accepting_new_clients_override === undefined) return acc;
      return Boolean(r.accepting_new_clients_override);
    }, undefined);

    res.json({
      providerUserId: target.providerUserId,
      schoolOrganizationId: aff.schoolId,
      schoolAcceptingNewClientsOverride: override === undefined ? null : override,
      assignments: rows || []
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

