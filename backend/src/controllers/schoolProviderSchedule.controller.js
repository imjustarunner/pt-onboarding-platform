import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import { adjustProviderSlots } from '../services/providerSlots.service.js';
import { notifyClientBecameCurrent } from '../services/clientNotifications.service.js';
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
                psa.is_active
         FROM provider_school_assignments psa
         JOIN users u ON u.id = psa.provider_user_id
         WHERE psa.school_organization_id = ?
         ORDER BY u.last_name ASC, u.first_name ASC, psa.day_of_week ASC`,
        [parseInt(schoolId, 10)]
      );
      rows = r || [];
    } catch (e) {
      // Older DB: fall back without the optional columns.
      const msg = String(e?.message || '');
      if (msg.includes('Unknown column')) {
        const [r] = await pool.execute(
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
        rows = (r || []).map((x) => ({
          ...x,
          accepting_new_clients_effective: true,
          provider_accepting_new_clients: true,
          accepting_new_clients_override: null
        }));
      } else {
        throw e;
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

    res.json(Array.from(byProvider.values()));
  } catch (e) {
    next(e);
  }
};

export const listAssignedClientsForProviderDay = async (req, res, next) => {
  try {
    const { schoolId, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const dayOfWeek = normalizeDay(req.query.dayOfWeek);
    if (!dayOfWeek) return res.status(400).json({ error: { message: `dayOfWeek is required (${allowedDays.join(', ')})` } });

    // Return restricted fields only (school portal).
    const [rows] = await pool.execute(
      `SELECT id, initials, status, document_status, provider_id, service_day
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

    // School staff can edit soft schedule details, but cannot assign providers/days.
    const requesterRole = String(req.user?.role || '').toLowerCase();
    if (requesterRole === 'school_staff') {
      return res.status(403).json({ error: { message: 'School staff cannot assign providers. Contact admin/support.' } });
    }

    const providerUserId = parseInt(req.body?.providerUserId, 10);
    const serviceDay = normalizeDay(req.body?.serviceDay);
    const force = req.body?.force === true || req.body?.force === 'true' || req.body?.force === 1 || req.body?.force === '1';
    if (!providerUserId || !serviceDay) {
      return res.status(400).json({ error: { message: `providerUserId and serviceDay are required (${allowedDays.join(', ')})` } });
    }

    // Providers can only assign themselves.
    if (requesterRole === 'provider' && parseInt(req.user.id, 10) !== providerUserId) {
      return res.status(403).json({ error: { message: 'Providers can only assign themselves.' } });
    }

    // Validate provider is scheduled for this school/day (active) and is accepting new clients (effective gate).
    // Backward compatible: if columns don't exist yet, default to accepting.
    let schedRow = null;
    try {
      const [sched] = await pool.execute(
        `SELECT id,
                COALESCE(accepting_new_clients_override, NULL) AS accepting_new_clients_override
         FROM provider_school_assignments
         WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ? AND is_active = TRUE
         LIMIT 1`,
        [providerUserId, parseInt(schoolId, 10), serviceDay]
      );
      schedRow = sched?.[0] || null;
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Unknown column')) {
        const [sched] = await pool.execute(
          `SELECT id FROM provider_school_assignments
           WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ? AND is_active = TRUE
           LIMIT 1`,
          [providerUserId, parseInt(schoolId, 10), serviceDay]
        );
        schedRow = sched?.[0] ? { ...sched[0], accepting_new_clients_override: null } : null;
      } else {
        throw e;
      }
    }

    if (!schedRow?.id) {
      return res.status(400).json({ error: { message: 'Provider is not scheduled for that school/day' } });
    }

    let providerAccepting = true;
    try {
      const [urows] = await pool.execute(
        `SELECT provider_accepting_new_clients
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [providerUserId]
      );
      if (urows?.[0]?.provider_accepting_new_clients !== undefined && urows?.[0]?.provider_accepting_new_clients !== null) {
        providerAccepting = !!urows[0].provider_accepting_new_clients;
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('Unknown column')) throw e;
    }

    const override = schedRow.accepting_new_clients_override;
    const effectiveAccepting = override === null || override === undefined ? providerAccepting : !!override;
    if (!effectiveAccepting) {
      return res.status(409).json({
        error: { message: 'Provider is not accepting new clients for this school/day.' }
      });
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
      const oldIsCurrent = !!(oldProviderId && oldDay);

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
      const warnings = [];
      if (needsTake) {
        const take = await adjustProviderSlots(connection, {
          providerUserId,
          schoolId: parseInt(schoolId, 10),
          dayOfWeek: serviceDay,
          delta: -1,
          allowNegative: false
        });
        if (!take.ok) {
          const canForce = force && (requesterRole === 'admin' || requesterRole === 'super_admin' || requesterRole === 'support');
          if (!canForce) {
            await connection.rollback();
            return res.status(400).json({ error: { message: take.reason } });
          }

          const forced = await adjustProviderSlots(connection, {
            providerUserId,
            schoolId: parseInt(schoolId, 10),
            dayOfWeek: serviceDay,
            delta: -1,
            allowNegative: true
          });
          if (!forced.ok) {
            await connection.rollback();
            return res.status(400).json({ error: { message: forced.reason || take.reason } });
          }
          warnings.push({ code: 'forced_over_capacity', message: 'Assigned past capacity (admin override).' });
        }
      }

      await connection.execute(
        `UPDATE clients
         SET provider_id = ?, service_day = ?, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [providerUserId, serviceDay, req.user.id, parseInt(clientId, 10)]
      );
      const newIsCurrent = true;

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
    // Notifications: client became Current (provider+day assigned)
    if (!oldIsCurrent) {
      notifyClientBecameCurrent({
        agencyId: updatedClient.agency_id,
        schoolOrganizationId: updatedClient.organization_id,
        clientId: updatedClient.id,
        providerUserId,
        clientNameOrIdentifier: updatedClient.identifier_code || updatedClient.full_name || updatedClient.initials
      }).catch(() => {});
    }
    res.json({ client: updatedClient, warnings: warnings || [] });
  } catch (e) {
    next(e);
  }
};

