import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import { adjustProviderSlots } from '../services/providerSlots.service.js';

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
    const ok = (orgs || []).some((o) => parseInt(o.id, 10) === schoolOrgId);
    if (!ok) return { ok: false, status: 403, message: 'You do not have access to this school organization' };
  }

  return { ok: true, school };
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

    const [rows] = await pool.execute(
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
       WHERE psa.school_organization_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC, psa.day_of_week ASC`,
      [parseInt(schoolId, 10)]
    );

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
          assignments: []
        });
      }
      byProvider.get(pid).assignments.push({
        day_of_week: r.day_of_week,
        slots_total: r.slots_total,
        slots_available: r.slots_available,
        start_time: r.start_time,
        end_time: r.end_time,
        is_active: !!r.is_active
      });
    }

    res.json(Array.from(byProvider.values()));
  } catch (e) {
    next(e);
  }
};

export const listScheduleEntries = async (req, res, next) => {
  try {
    const { schoolId, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const dayOfWeek = normalizeDay(req.query.dayOfWeek);
    if (!dayOfWeek) return res.status(400).json({ error: { message: `dayOfWeek is required (${allowedDays.join(', ')})` } });

    const [rows] = await pool.execute(
      `SELECT e.*,
              c.initials AS client_initials
       FROM school_provider_schedule_entries e
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.school_organization_id = ? AND e.provider_user_id = ? AND e.day_of_week = ?
       ORDER BY e.start_time ASC, e.end_time ASC, e.id ASC`,
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

    const [result] = await pool.execute(
      `INSERT INTO school_provider_schedule_entries
        (school_organization_id, provider_user_id, day_of_week, client_id, start_time, end_time, room, teacher, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(schoolId, 10),
        parseInt(providerId, 10),
        dayOfWeek,
        clientId,
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

export const deleteScheduleEntry = async (req, res, next) => {
  try {
    const { schoolId, providerId, entryId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

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
export const assignProviderForSchoolClient = async (req, res, next) => {
  try {
    const { schoolId, clientId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const providerUserId = parseInt(req.body?.providerUserId, 10);
    const serviceDay = normalizeDay(req.body?.serviceDay);
    if (!providerUserId || !serviceDay) {
      return res.status(400).json({ error: { message: `providerUserId and serviceDay are required (${allowedDays.join(', ')})` } });
    }

    // Validate provider is scheduled for this school/day (active) before doing any client updates.
    const [sched] = await pool.execute(
      `SELECT id FROM provider_school_assignments
       WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ? AND is_active = TRUE
       LIMIT 1`,
      [providerUserId, parseInt(schoolId, 10), serviceDay]
    );
    if (!sched?.[0]?.id) {
      return res.status(400).json({ error: { message: 'Provider is not scheduled for that school/day' } });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [clientRows] = await connection.execute(
        `SELECT id, agency_id, organization_id, provider_id, service_day
         FROM clients
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [parseInt(clientId, 10)]
      );
      const client = clientRows?.[0];
      if (!client) {
        await connection.rollback();
        return res.status(404).json({ error: { message: 'Client not found' } });
      }
      if (parseInt(client.organization_id, 10) !== parseInt(schoolId, 10)) {
        await connection.rollback();
        return res.status(400).json({ error: { message: 'Client does not belong to this school organization' } });
      }

      const oldProviderId = client.provider_id ? parseInt(client.provider_id, 10) : null;
      const oldDay = client.service_day ? String(client.service_day) : null;

      // Release old slot if changing away from old assignment
      if (oldProviderId && oldDay) {
        const same = oldProviderId === providerUserId && oldDay === serviceDay;
        if (!same) {
          await adjustProviderSlots(connection, {
            providerUserId: oldProviderId,
            schoolId: parseInt(schoolId, 10),
            dayOfWeek: oldDay,
            delta: +1
          });
        }
      }

      // Take new slot if needed
      const needsTake = !(oldProviderId === providerUserId && oldDay === serviceDay);
      if (needsTake) {
        const take = await adjustProviderSlots(connection, {
          providerUserId,
          schoolId: parseInt(schoolId, 10),
          dayOfWeek: serviceDay,
          delta: -1
        });
        if (!take.ok) {
          await connection.rollback();
          return res.status(400).json({ error: { message: take.reason } });
        }
      }

      await connection.execute(
        `UPDATE clients
         SET provider_id = ?, service_day = ?, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [providerUserId, serviceDay, req.user.id, parseInt(clientId, 10)]
      );

      if (oldProviderId !== providerUserId) {
        await connection.execute(
          `INSERT INTO client_status_history (client_id, changed_by_user_id, field_changed, from_value, to_value, note)
           VALUES (?, ?, 'provider_id', ?, ?, ?)`,
          [
            parseInt(clientId, 10),
            req.user.id,
            oldProviderId ? String(oldProviderId) : null,
            providerUserId ? String(providerUserId) : null,
            'Assigned via school portal schedule'
          ]
        );
      }
      if (oldDay !== serviceDay) {
        await connection.execute(
          `INSERT INTO client_status_history (client_id, changed_by_user_id, field_changed, from_value, to_value, note)
           VALUES (?, ?, 'service_day', ?, ?, ?)`,
          [parseInt(clientId, 10), req.user.id, oldDay || null, serviceDay || null, 'Assigned via school portal schedule']
        );
      }

      await connection.commit();
    } finally {
      connection.release();
    }

    const updatedClient = await Client.findById(parseInt(clientId, 10));
    res.json(updatedClient);
  } catch (e) {
    next(e);
  }
};

