import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';
import { listAgencyIdsInTenantTree } from '../utils/meDashboardTenantScope.js';
import config from '../config/config.js';
import https from 'https';
import { toDateOnlyString } from '../utils/mysqlDateTime.utils.js';

/** One row per calendar date for admin display (availability is per-date, not per-location). */
const AVAIL_RANK = { slot: 0, available: 0, waitlist: 1, oncall: 2, unavailable: 3 };

function dedupeDateEntriesForDisplay(entries) {
  const byDate = new Map();
  for (const de of entries) {
    const d = toDateOnlyString(de.entry_date);
    if (!d) continue;
    const normalized = { ...de, entry_date: d };
    const existing = byDate.get(d);
    if (!existing) {
      byDate.set(d, normalized);
      continue;
    }
    const rankA = AVAIL_RANK[existing.availability] ?? 9;
    const rankB = AVAIL_RANK[normalized.availability] ?? 9;
    if (rankB < rankA) {
      byDate.set(d, normalized);
    } else if (rankB === rankA && !existing.comment && normalized.comment) {
      byDate.set(d, normalized);
    }
  }
  return [...byDate.values()].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
}

function dedupeLocationRanksForDisplay(ranks) {
  const byLoc = new Map();
  for (const lr of ranks) {
    const loc = String(lr.location || '').trim();
    if (!loc) continue;
    const existing = byLoc.get(loc);
    if (!existing || Number(lr.rank_order) < Number(existing.rank_order)) {
      byLoc.set(loc, lr);
    }
  }
  return [...byLoc.values()].sort((a, b) => Number(a.rank_order) - Number(b.rank_order));
}

const parseId = (raw) => {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const parseJson = (raw) => {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
};

async function canManage(req, agencyId) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  if (!['admin', 'support', 'staff'].includes(role)) return false;
  // Verify user belongs to this agency
  const [rows] = await pool.execute(
    `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
    [req.user.id, agencyId]
  );
  return rows.length > 0;
}

async function getTargetUserIds(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND u.status IN ('active', 'pending')
       AND u.role NOT IN ('super_admin')`,
    [agencyId]
  );
  return rows.map((r) => r.id);
}

// ─── Admin: create request ─────────────────────────────────────────────────────

export const createRequest = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const { title, subtitle, description, onCallEnabled = true, deadline, events = [] } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: { message: 'title is required' } });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [ins] = await conn.execute(
        `INSERT INTO facilitator_availability_requests
          (agency_id, title, subtitle, description, on_call_enabled, deadline, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          agencyId,
          title.trim(),
          subtitle?.trim() || null,
          description?.trim() || null,
          onCallEnabled ? 1 : 0,
          deadline || null,
          req.user.id
        ]
      );
      const requestId = ins.insertId;

      if (Array.isArray(events) && events.length > 0) {
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          const isProgram = ev?._type === 'program';
          const eventId = parseId(ev?.companyEventId ?? ev?.company_event_id ?? (!isProgram ? ev?.id : null));
          const programId = isProgram ? parseId(ev?.programId ?? ev?.program_id ?? ev?.id) : null;
          if (!eventId && !programId) continue;
          const locs = Array.isArray(ev?.locations) ? ev.locations : [];
          await conn.execute(
            `INSERT INTO facilitator_availability_request_events
              (request_id, company_event_id, program_id, locations_json, display_order)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE locations_json = VALUES(locations_json), display_order = VALUES(display_order)`,
            [requestId, eventId || null, programId || null, JSON.stringify(locs), i]
          );
        }
      }

      await conn.commit();
      res.status(201).json({ ok: true, id: requestId });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
};

// ─── Admin: list requests for agency ──────────────────────────────────────────

export const listRequests = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      `SELECT r.*,
              COUNT(DISTINCT s.id) AS submission_count,
              COUNT(DISTINCT CASE WHEN s.submitted_at IS NOT NULL THEN s.id END) AS submitted_count
       FROM facilitator_availability_requests r
       LEFT JOIN facilitator_availability_submissions s ON s.request_id = r.id
       WHERE r.agency_id = ?
       GROUP BY r.id
       ORDER BY r.created_at DESC`,
      [agencyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// ─── Admin: get single request (full form structure) ──────────────────────────

export const getRequest = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [[request]] = await pool.execute(
      `SELECT * FROM facilitator_availability_requests WHERE id = ? AND agency_id = ? LIMIT 1`,
      [requestId, agencyId]
    );
    if (!request) return res.status(404).json({ error: { message: 'Not found' } });

    const [reqEvents] = await pool.execute(
      `SELECT fare.*,
              COALESCE(ce.title, p.name) AS event_title,
              ce.starts_at AS event_date, ce.ends_at AS end_date,
              ce.employee_report_time, ce.employee_departure_time,
              ce.public_session_label, ce.public_session_date_range,
              CASE WHEN fare.program_id IS NOT NULL THEN 'program' ELSE 'company_event' END AS _type
       FROM facilitator_availability_request_events fare
       LEFT JOIN company_events ce ON ce.id = fare.company_event_id
       LEFT JOIN programs p ON p.id = fare.program_id
       WHERE fare.request_id = ?
       ORDER BY fare.display_order`,
      [requestId]
    );

    for (const re of reqEvents) {
      re.locations_json = parseJson(re.locations_json) || [];
      if (re.program_id) {
        // Program: session dates from distinct shift signup dates
        const [dates] = await pool.execute(
          `SELECT DISTINCT pss.slot_date AS session_date, pss.start_time AS starts_at,
                  ps.name AS location_label, pss.program_site_id AS id
           FROM program_shift_signups pss
           JOIN program_sites ps ON ps.id = pss.program_site_id
           WHERE ps.program_id = ?
           ORDER BY pss.slot_date, pss.start_time`,
          [re.program_id]
        );
        re.session_dates = dates;
      } else {
        const [dates] = await pool.execute(
          `SELECT id, session_date, starts_at, ends_at, timezone, location_label, location_address
           FROM company_event_session_dates
           WHERE company_event_id = ?
           ORDER BY session_date, starts_at`,
          [re.company_event_id]
        );
        re.session_dates = dates;
      }
    }

    res.json({ ...request, events: reqEvents });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: update request (draft only) ───────────────────────────────────────

export const updateRequest = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [[existing]] = await pool.execute(
      `SELECT id, status FROM facilitator_availability_requests WHERE id = ? AND agency_id = ? LIMIT 1`,
      [requestId, agencyId]
    );
    if (!existing) return res.status(404).json({ error: { message: 'Not found' } });
    if (existing.status === 'closed') return res.status(409).json({ error: { message: 'Cannot edit a closed request' } });

    const { title, subtitle, description, onCallEnabled, deadline, events, status } = req.body;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `UPDATE facilitator_availability_requests
         SET title = COALESCE(?, title),
             subtitle = ?,
             description = ?,
             on_call_enabled = COALESCE(?, on_call_enabled),
             deadline = ?,
             status = COALESCE(?, status)
         WHERE id = ?`,
        [
          title?.trim() || null,
          subtitle !== undefined ? (subtitle?.trim() || null) : undefined,
          description !== undefined ? (description?.trim() || null) : undefined,
          onCallEnabled !== undefined ? (onCallEnabled ? 1 : 0) : null,
          deadline !== undefined ? (deadline || null) : undefined,
          status || null,
          requestId
        ]
      );

      if (Array.isArray(events)) {
        await conn.execute(
          `DELETE FROM facilitator_availability_request_events WHERE request_id = ?`,
          [requestId]
        );
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          const eventId = parseId(ev?.companyEventId ?? ev?.company_event_id ?? ev?.id);
          if (!eventId) continue;
          const locs = Array.isArray(ev?.locations) ? ev.locations : [];
          await conn.execute(
            `INSERT INTO facilitator_availability_request_events
              (request_id, company_event_id, locations_json, display_order)
             VALUES (?, ?, ?, ?)`,
            [requestId, eventId, JSON.stringify(locs), i]
          );
        }
      }

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
};

// ─── Admin: push request to all employees ─────────────────────────────────────

export const pushRequest = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [[request]] = await pool.execute(
      `SELECT id, agency_id, title, subtitle, deadline, status
       FROM facilitator_availability_requests
       WHERE id = ? AND agency_id = ? LIMIT 1`,
      [requestId, agencyId]
    );
    if (!request) return res.status(404).json({ error: { message: 'Not found' } });
    if (request.status === 'closed') return res.status(409).json({ error: { message: 'Request is closed' } });

    const [reqEventRows] = await pool.execute(
      `SELECT id FROM facilitator_availability_request_events WHERE request_id = ?`,
      [requestId]
    );
    if (reqEventRows.length === 0) {
      return res.status(400).json({ error: { message: 'Add at least one program event before pushing' } });
    }

    // Mark as active
    await pool.execute(
      `UPDATE facilitator_availability_requests
       SET status = 'active', push_sent_at = NOW(), push_sent_by = ?
       WHERE id = ?`,
      [req.user.id, requestId]
    );

    const userIds = await getTargetUserIds(agencyId);
    const deadlineStr = request.deadline
      ? ` Please respond by ${new Date(request.deadline).toLocaleDateString()}.`
      : '';

    let sent = 0;
    for (const uid of userIds) {
      try {
        await Notification.create({
          type: 'facilitator_availability_push',
          severity: 'warning',
          title: `Availability request: ${request.title}`,
          message: `Please complete your facilitator availability form for "${request.title}".${deadlineStr}`,
          userId: uid,
          agencyId,
          relatedEntityType: 'facilitator_availability_request',
          relatedEntityId: requestId,
          actorUserId: req.user?.id || null,
          actorSource: 'facilitator_availability_push'
        });
        sent++;
      } catch {
        // best effort
      }
    }

    res.json({ ok: true, recipientCount: userIds.length, notificationsSent: sent });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: get all responses (grid) ──────────────────────────────────────────

export const getResponses = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [[request]] = await pool.execute(
      `SELECT id FROM facilitator_availability_requests WHERE id = ? AND agency_id = ? LIMIT 1`,
      [requestId, agencyId]
    );
    if (!request) return res.status(404).json({ error: { message: 'Not found' } });

    const [submissions] = await pool.execute(
      `SELECT s.*, u.first_name, u.last_name, u.email
       FROM facilitator_availability_submissions s
       JOIN users u ON u.id = s.user_id
       WHERE s.request_id = ?
       ORDER BY u.last_name, u.first_name`,
      [requestId]
    );

    const submissionIds = submissions.map((s) => s.id);

    let dateEntries = [];
    let locationRanks = [];

    if (submissionIds.length > 0) {
      const placeholders = submissionIds.map(() => '?').join(',');
      const [de] = await pool.execute(
        `SELECT * FROM facilitator_availability_date_entries WHERE submission_id IN (${placeholders})`,
        submissionIds
      );
      dateEntries = de;

      const [lr] = await pool.execute(
        `SELECT * FROM facilitator_availability_location_ranks WHERE submission_id IN (${placeholders})`,
        submissionIds
      );
      locationRanks = lr;
    }

    const bySubmission = {};
    for (const s of submissions) {
      bySubmission[s.id] = {
        ...s,
        dateEntries: [],
        locationRanks: []
      };
    }
    for (const de of dateEntries) {
      if (bySubmission[de.submission_id]) bySubmission[de.submission_id].dateEntries.push(de);
    }
    for (const lr of locationRanks) {
      if (bySubmission[lr.submission_id]) bySubmission[lr.submission_id].locationRanks.push(lr);
    }

    // Availability is per calendar date — collapse duplicate rows from multi-location fan-out
    for (const sub of Object.values(bySubmission)) {
      sub.dateEntries = dedupeDateEntriesForDisplay(sub.dateEntries);
      sub.locationRanks = dedupeLocationRanksForDisplay(sub.locationRanks);
    }

    res.json(Object.values(bySubmission));
  } catch (err) {
    next(err);
  }
};

// ─── Employee: list my pending requests ───────────────────────────────────────

export const listMyPending = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthenticated' } });

    // Active requests for agencies this user belongs to, with no submitted submission yet
    const [rows] = await pool.execute(
      `SELECT r.id, r.title, r.subtitle, r.deadline, r.agency_id, r.on_call_enabled,
              s.id AS submission_id, s.submitted_at
       FROM facilitator_availability_requests r
       JOIN user_agencies ua ON ua.agency_id = r.agency_id AND ua.user_id = ?
       LEFT JOIN facilitator_availability_submissions s ON s.request_id = r.id AND s.user_id = ?
       WHERE r.status = 'active'
         AND (s.id IS NULL OR s.submitted_at IS NULL)
       ORDER BY r.created_at DESC`,
      [userId, userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// ─── Employee: get request form with existing draft ───────────────────────────

export const getRequestForEmployee = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const requestId = parseId(req.params?.requestId);
    if (!userId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const [[request]] = await pool.execute(
      `SELECT r.*
       FROM facilitator_availability_requests r
       JOIN user_agencies ua ON ua.agency_id = r.agency_id AND ua.user_id = ?
       WHERE r.id = ? AND r.status IN ('active', 'closed')
       LIMIT 1`,
      [userId, requestId]
    );
    if (!request) return res.status(404).json({ error: { message: 'Not found or not active' } });

    const [reqEvents] = await pool.execute(
      `SELECT fare.*,
              COALESCE(ce.title, p.name) AS event_title,
              ce.starts_at AS event_date, ce.ends_at AS end_date,
              ce.employee_report_time, ce.employee_departure_time,
              ce.public_session_label, ce.public_session_date_range,
              COALESCE(NULLIF(ce.event_location_address,''), NULLIF(ce.public_location_address,'')) AS event_location_address,
              CASE WHEN fare.program_id IS NOT NULL THEN 'program' ELSE 'company_event' END AS _type
       FROM facilitator_availability_request_events fare
       LEFT JOIN company_events ce ON ce.id = fare.company_event_id
       LEFT JOIN programs p ON p.id = fare.program_id
       WHERE fare.request_id = ?
         AND (fare.program_id IS NOT NULL OR ce.is_active = 1)
       ORDER BY fare.display_order`,
      [requestId]
    );

    // Slot data only applies to company_event-based entries (programs use signups differently).
    const ceEventIds = reqEvents.filter((re) => re.company_event_id).map((re) => re.company_event_id);
    const slotMap = {};

    if (ceEventIds.length) {
      const ph = ceEventIds.map(() => '?').join(',');

      const [groupCounts] = await pool.execute(
        `SELECT cesd.id AS session_date_id,
                COUNT(DISTINCT cesg.id) AS group_count,
                COUNT(DISTINCT cecga.client_id) AS participant_count
         FROM company_event_session_dates cesd
         LEFT JOIN company_event_session_groups cesg ON cesg.session_date_id = cesd.id
         LEFT JOIN company_event_client_group_assignments cecga ON cecga.group_id = cesg.id
         WHERE cesd.company_event_id IN (${ph})
         GROUP BY cesd.id`,
        ceEventIds
      );

      const [overrides] = await pool.execute(
        `SELECT cesd.id AS session_date_id, faso.slot_count
         FROM facilitator_availability_slot_overrides faso
         JOIN facilitator_availability_request_events fare
           ON fare.company_event_id = faso.company_event_id
         JOIN company_event_session_dates cesd
           ON cesd.company_event_id = faso.company_event_id AND cesd.session_date = faso.entry_date
         WHERE fare.request_id = ?`,
        [requestId]
      );
      const overrideMap = {};
      for (const o of overrides) overrideMap[o.session_date_id] = o.slot_count;

      const [filledRows] = await pool.execute(
        `SELECT cesd.id AS session_date_id, COUNT(cesp.id) AS filled
         FROM company_event_session_dates cesd
         LEFT JOIN company_event_session_providers cesp ON cesp.session_date_id = cesd.id
         WHERE cesd.company_event_id IN (${ph})
         GROUP BY cesd.id`,
        ceEventIds
      );
      const filledMap = {};
      for (const f of filledRows) filledMap[f.session_date_id] = Number(f.filled);

      for (const gc of groupCounts) {
        const autoSlots = (Number(gc.group_count) >= 2 || Number(gc.participant_count) > 9) ? 4 : 2;
        const effectiveSlots = overrideMap[gc.session_date_id] ?? autoSlots;
        const filledSlots = filledMap[gc.session_date_id] ?? 0;
        slotMap[gc.session_date_id] = {
          effectiveSlots,
          filledSlots,
          openSlots: Math.max(0, effectiveSlots - filledSlots)
        };
      }
    }

    for (const re of reqEvents) {
      re.locations_json = parseJson(re.locations_json) || [];
      if (re.program_id) {
        // Program: derive session dates from distinct shift signup dates across all sites
        const [dates] = await pool.execute(
          `SELECT DISTINCT pss.slot_date AS session_date, pss.start_time AS starts_at,
                  NULL AS ends_at, NULL AS timezone,
                  ps.name AS location_label, NULL AS location_address,
                  CONCAT('prog_', pss.program_site_id, '_', pss.slot_date) AS id,
                  pss.program_site_id
           FROM program_shift_signups pss
           JOIN program_sites ps ON ps.id = pss.program_site_id
           WHERE ps.program_id = ?
           ORDER BY pss.slot_date, pss.start_time`,
          [re.program_id]
        );
        re.session_dates = dates.map((d) => ({
          ...d,
          session_date: toDateOnlyString(d.session_date),
          effectiveSlots: 2, filledSlots: 0, openSlots: 2  // programs use signup count not slot system
        }));
      } else {
        const [dates] = await pool.execute(
          `SELECT id, session_date, starts_at, ends_at, timezone, location_label, location_address
           FROM company_event_session_dates
           WHERE company_event_id = ?
           ORDER BY session_date, starts_at`,
          [re.company_event_id]
        );
        re.session_dates = dates.map((d) => ({
          ...d,
          session_date: toDateOnlyString(d.session_date),
          ...(slotMap[d.id] || { effectiveSlots: 2, filledSlots: 0, openSlots: 2 })
        }));
      }
    }

    // Existing submission (draft or submitted)
    const [[submission]] = await pool.execute(
      `SELECT * FROM facilitator_availability_submissions WHERE request_id = ? AND user_id = ? LIMIT 1`,
      [requestId, userId]
    );

    let dateEntries = [];
    let locationRanks = [];

    if (submission) {
      const [de] = await pool.execute(
        `SELECT * FROM facilitator_availability_date_entries WHERE submission_id = ?`,
        [submission.id]
      );
      dateEntries = de;
      const [lr] = await pool.execute(
        `SELECT * FROM facilitator_availability_location_ranks WHERE submission_id = ?`,
        [submission.id]
      );
      locationRanks = lr;
    }

    res.json({
      ...request,
      events: reqEvents,
      submission: submission
        ? {
            ...submission,
            dateEntries: dedupeDateEntriesForDisplay(dateEntries),
            locationRanks: dedupeLocationRanksForDisplay(locationRanks)
          }
        : null
    });
  } catch (err) {
    next(err);
  }
};

// ─── Employee: submit/save availability response ───────────────────────────────

export const submitResponse = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const requestId = parseId(req.params?.requestId);
    if (!userId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const [[request]] = await pool.execute(
      `SELECT r.id, r.status
       FROM facilitator_availability_requests r
       JOIN user_agencies ua ON ua.agency_id = r.agency_id AND ua.user_id = ?
       WHERE r.id = ? AND r.status = 'active'
       LIMIT 1`,
      [userId, requestId]
    );
    if (!request) return res.status(404).json({ error: { message: 'Not found or no longer active' } });

    const {
      isOnCall = false,
      generalNotes = null,
      submit = false,         // true = formal submission; false = save draft
      dateEntries = [],       // [{ companyEventId, sessionDateId, entryDate, availability, comment }]
      locationRanks = []      // [{ requestEventId, location, rankOrder }]
    } = req.body;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Upsert submission row
      const [existing] = await conn.execute(
        `SELECT id FROM facilitator_availability_submissions WHERE request_id = ? AND user_id = ? LIMIT 1`,
        [requestId, userId]
      );

      let submissionId;
      if (existing.length > 0) {
        submissionId = existing[0].id;
        await conn.execute(
          `UPDATE facilitator_availability_submissions
           SET is_on_call = ?, general_notes = ?, submitted_at = ?
           WHERE id = ?`,
          [
            isOnCall ? 1 : 0,
            generalNotes?.trim() || null,
            submit ? new Date() : null,
            submissionId
          ]
        );
      } else {
        const [ins] = await conn.execute(
          `INSERT INTO facilitator_availability_submissions
            (request_id, user_id, is_on_call, general_notes, submitted_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            requestId,
            userId,
            isOnCall ? 1 : 0,
            generalNotes?.trim() || null,
            submit ? new Date() : null
          ]
        );
        submissionId = ins.insertId;
      }

      // Replace date entries
      await conn.execute(
        `DELETE FROM facilitator_availability_date_entries WHERE submission_id = ?`,
        [submissionId]
      );
      const VALID_AVAIL = new Set(['slot', 'waitlist', 'oncall', 'unavailable', 'available']);
      // One row per calendar date (form collects availability per date, not per location)
      const seenDates = new Set();
      for (const de of dateEntries) {
        const entryDate = toDateOnlyString(de?.entryDate ?? de?.entry_date);
        if (!entryDate || seenDates.has(entryDate)) continue;
        seenDates.add(entryDate);

        const isProgram = !!de?.programId || !!de?.program_id;
        const eventId = isProgram ? null : parseId(de?.companyEventId ?? de?.company_event_id);
        const programId = isProgram ? parseId(de?.programId ?? de?.program_id) : null;
        if (!eventId && !programId) continue;
        const avail = VALID_AVAIL.has(de?.availability) ? de.availability : 'unavailable';
        await conn.execute(
          `INSERT INTO facilitator_availability_date_entries
            (submission_id, request_id, user_id, company_event_id, program_id, session_date_id, entry_date,
             availability, waitlist_willing, oncall_willing, comment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            submissionId,
            requestId,
            userId,
            eventId,
            programId,
            parseId(de?.sessionDateId ?? de?.session_date_id) || null,
            entryDate,
            avail,
            de?.waitlistWilling ? 1 : 0,
            de?.oncallWilling ? 1 : 0,
            de?.comment?.trim() || null
          ]
        );
      }

      // Replace location ranks
      await conn.execute(
        `DELETE FROM facilitator_availability_location_ranks WHERE submission_id = ?`,
        [submissionId]
      );
      const seenLocs = new Map();
      for (const lr of locationRanks) {
        const loc = String(lr?.location || '').trim();
        if (!loc) continue;
        const rank = Math.max(1, Number(lr?.rankOrder ?? lr?.rank_order ?? 1));
        const reqEventId = parseId(lr?.requestEventId ?? lr?.request_event_id);
        const existing = seenLocs.get(loc);
        if (existing && existing.rank <= rank) continue;
        seenLocs.set(loc, { rank, reqEventId });
      }
      for (const [loc, { rank, reqEventId }] of seenLocs) {
        if (!reqEventId) continue;
        await conn.execute(
          `INSERT INTO facilitator_availability_location_ranks
            (submission_id, request_event_id, location, rank_order)
           VALUES (?, ?, ?, ?)`,
          [submissionId, reqEventId, loc, rank]
        );
      }

      await conn.commit();
      res.json({ ok: true, submissionId, submitted: !!submit });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
};

// ─── Slot computation helper ──────────────────────────────────────────────────

function computeAutoSlots({ groupCount, participantCount }) {
  // Default 2; expands to 4 when 2+ groups are added OR more than 9 participants enrolled.
  if (groupCount >= 2 || participantCount > 9) return 4;
  return 2;
}

function slotReason({ groupCount, participantCount }) {
  if (groupCount >= 2) return `auto (${groupCount} groups)`;
  if (participantCount > 9) return `auto (${participantCount} participants)`;
  return 'auto';
}

function personName(first, last, email) {
  return `${first || ''} ${last || ''}`.trim() || email || 'Unknown';
}

const AVAIL_FOR_STAFFING = new Set(['slot', 'waitlist', 'oncall', 'available']);

async function syncEventProviderAssignment(conn, { eventId, providerUserId }) {
  const [existing] = await conn.execute(
    `SELECT 1 AS ok FROM company_event_provider_assignments
     WHERE company_event_id = ? AND provider_user_id = ? LIMIT 1`,
    [eventId, providerUserId]
  );
  if (existing?.[0]?.ok) return;
  const [[userRow]] = await conn.execute(`SELECT title FROM users WHERE id = ? LIMIT 1`, [providerUserId]);
  const roleTitle = String(userRow?.title || '').trim() || 'Facilitator';
  await conn.execute(
    `INSERT INTO company_event_provider_assignments
      (company_event_id, provider_user_id, role_title, role_key, is_primary_access, virtual_access_role)
     VALUES (?, ?, ?, NULL, 0, 'participant')`,
    [eventId, providerUserId, roleTitle]
  );
}

async function removeEventProviderIfNoFinalizedSessions(conn, { eventId, providerUserId }) {
  const [[row]] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM company_event_session_providers
     WHERE company_event_id = ? AND provider_user_id = ? AND assignment_status = 'finalized'`,
    [eventId, providerUserId]
  );
  if (Number(row?.cnt || 0) > 0) return;
  await conn.execute(
    `DELETE FROM company_event_provider_assignments WHERE company_event_id = ? AND provider_user_id = ?`,
    [eventId, providerUserId]
  );
}

async function computeSessionSlotMeta({ requestId, companyEventId, sessionDateId, sessionDateStr }) {
  const [[groupRow]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM company_event_session_groups WHERE session_date_id = ?`,
    [sessionDateId]
  );
  const [[participantRow]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM company_event_client_group_assignments WHERE session_date_id = ?`,
    [sessionDateId]
  );
  const groupCount = Number(groupRow?.cnt ?? 0);
  const participantCount = Number(participantRow?.cnt ?? 0);
  const autoSlots = computeAutoSlots({ groupCount, participantCount });
  const [[overrideRow]] = await pool.execute(
    `SELECT slot_count FROM facilitator_availability_slot_overrides
     WHERE request_id = ? AND company_event_id = ? AND entry_date = ?
     LIMIT 1`,
    [requestId, companyEventId, sessionDateStr]
  );
  const override = overrideRow ? Number(overrideRow.slot_count) : null;
  const effectiveSlots = override !== null ? override : autoSlots;
  return {
    groupCount,
    participantCount,
    autoSlots,
    override,
    effectiveSlots,
    slotReason: slotReason({ groupCount, participantCount })
  };
}

async function assertRequestInAgency(requestId, agencyId) {
  const [[request]] = await pool.execute(
    `SELECT id, title, status, tentative_schedule_posted_at, final_schedule_published_at
     FROM facilitator_availability_requests WHERE id = ? AND agency_id = ? LIMIT 1`,
    [requestId, agencyId]
  );
  return request || null;
}

async function insertSessionProviderAssignment(conn, {
  agencyId, eventId, sdId, providerUserId, assignedByUserId, assignmentStatus = 'draft'
}) {
  await conn.execute(
    `INSERT INTO company_event_session_providers
      (company_event_id, agency_id, session_date_id, provider_user_id, assigned_by_user_id, assigned_at, assignment_status)
     VALUES (?, ?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       assigned_by_user_id = VALUES(assigned_by_user_id),
       assigned_at = NOW()`,
    [eventId, agencyId, sdId, providerUserId, assignedByUserId, assignmentStatus]
  );
  await conn.execute(
    `UPDATE company_event_session_provider_requests
     SET status = 'approved', decided_by_user_id = ?, decided_at = NOW()
     WHERE company_event_id = ? AND session_date_id = ? AND provider_user_id = ?
       AND status IN ('pending', 'waitlist')`,
    [assignedByUserId, eventId, sdId, providerUserId]
  );
}

async function transitionAssignmentStatus(conn, {
  agencyId, requestId, requestTitle, mode, companyEventId, assignmentIds, publisherUserId
}) {
  const nextStatus = mode === 'finalized' ? 'finalized' : 'tentative';
  const params = [agencyId, requestId];
  let where = `csp.agency_id = ?
    AND csp.company_event_id IN (
      SELECT fare.company_event_id FROM facilitator_availability_request_events fare WHERE fare.request_id = ?
    )`;
  if (mode === 'finalized') {
    where += " AND csp.assignment_status IN ('draft', 'tentative')";
  } else {
    where += " AND csp.assignment_status = 'draft'";
  }
  if (companyEventId) {
    where += ' AND csp.company_event_id = ?';
    params.push(companyEventId);
  }
  const idList = (Array.isArray(assignmentIds) ? assignmentIds : [])
    .map((id) => parseId(id))
    .filter(Boolean);
  if (idList.length) {
    where += ` AND csp.id IN (${idList.map(() => '?').join(',')})`;
    params.push(...idList);
  }

  const [rows] = await conn.execute(
    `SELECT csp.id, csp.company_event_id, csp.provider_user_id
     FROM company_event_session_providers csp
     WHERE ${where}`,
    params
  );

  const affectedUserEvents = new Map();
  for (const row of rows || []) {
    await conn.execute(
      `UPDATE company_event_session_providers
       SET assignment_status = ?, published_at = NOW(), published_by_user_id = ?
       WHERE id = ?`,
      [nextStatus, publisherUserId, row.id]
    );
    if (nextStatus === 'finalized') {
      const key = `${row.company_event_id}:${row.provider_user_id}`;
      affectedUserEvents.set(key, { eventId: row.company_event_id, providerUserId: row.provider_user_id });
    }
  }

  for (const { eventId, providerUserId } of affectedUserEvents.values()) {
    await syncEventProviderAssignment(conn, { eventId, providerUserId });
  }

  const requestField = mode === 'finalized' ? 'final_schedule_published_at' : 'tentative_schedule_posted_at';
  await conn.execute(
    `UPDATE facilitator_availability_requests SET ${requestField} = NOW() WHERE id = ?`,
    [requestId]
  );

  const notifyUserIds = [...new Set((rows || []).map((r) => r.provider_user_id))];
  const notifyTitle = mode === 'finalized'
    ? `Final schedule published: ${requestTitle}`
    : `Tentative schedule posted: ${requestTitle}`;
  const notifyMessage = mode === 'finalized'
    ? `Your finalized facilitator schedule for "${requestTitle}" is now available.`
    : `A tentative facilitator schedule for "${requestTitle}" has been posted — details may still change.`;

  for (const uid of notifyUserIds) {
    try {
      await Notification.create({
        type: mode === 'finalized' ? 'facilitator_schedule_finalized' : 'facilitator_schedule_tentative',
        severity: mode === 'finalized' ? 'success' : 'warning',
        title: notifyTitle,
        message: notifyMessage,
        userId: uid,
        agencyId,
        relatedEntityType: 'facilitator_availability_request',
        relatedEntityId: requestId,
        actorUserId: publisherUserId,
        actorSource: 'facilitator_availability_publish'
      });
    } catch {
      /* best effort */
    }
  }

  return { updatedCount: (rows || []).length, notifiedCount: notifyUserIds.length };
}

// ─── Admin: staffing workspace (main interface) ───────────────────────────────

export const getStaffingWorkspace = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const request = await assertRequestInAgency(requestId, agencyId);
    if (!request) return res.status(404).json({ error: { message: 'Not found' } });

    const [reqEvents] = await pool.execute(
      `SELECT fare.id AS request_event_id, fare.company_event_id, fare.locations_json, fare.display_order,
              ce.title AS event_title, ce.starts_at, ce.ends_at
       FROM facilitator_availability_request_events fare
       JOIN company_events ce ON ce.id = fare.company_event_id AND ce.is_active = 1
       WHERE fare.request_id = ?
       ORDER BY fare.display_order, ce.title`,
      [requestId]
    );

    const events = [];
    let totalSlotsNeeded = 0;
    let totalSlotsFilled = 0;
    const statusCounts = { draft: 0, tentative: 0, finalized: 0 };

    for (const ev of reqEvents) {
      const locationsJson = parseJson(ev.locations_json) || [];
      const [sessionDates] = await pool.execute(
        `SELECT id, session_date, starts_at, ends_at, timezone, location_label
         FROM company_event_session_dates
         WHERE company_event_id = ?
         ORDER BY session_date, starts_at`,
        [ev.company_event_id]
      );

      const sessionDateRows = [];
      let eventSlotsNeeded = 0;
      let eventSlotsFilled = 0;
      const assignedUserIds = new Set();

      for (const sd of sessionDates) {
        const dateStr = toDateOnlyString(sd.session_date) || '';
        if (!dateStr) continue;
        const slotMeta = await computeSessionSlotMeta({
          requestId,
          companyEventId: ev.company_event_id,
          sessionDateId: sd.id,
          sessionDateStr: dateStr
        });

        const [assignedRows] = await pool.execute(
          `SELECT csp.id AS session_provider_id, csp.provider_user_id, csp.assignment_status,
                  u.first_name, u.last_name, u.email
           FROM company_event_session_providers csp
           JOIN users u ON u.id = csp.provider_user_id
           WHERE csp.company_event_id = ? AND csp.session_date_id = ?
           ORDER BY u.last_name, u.first_name`,
          [ev.company_event_id, sd.id]
        );

        const assigned = (assignedRows || []).map((r) => {
          assignedUserIds.add(r.provider_user_id);
          const st = String(r.assignment_status || 'draft');
          if (statusCounts[st] != null) statusCounts[st] += 1;
          return {
            sessionProviderId: r.session_provider_id,
            userId: r.provider_user_id,
            name: personName(r.first_name, r.last_name, r.email),
            email: r.email,
            assignmentStatus: st
          };
        });

        const filled = assigned.length;
        const openSlots = Math.max(0, slotMeta.effectiveSlots - filled);
        eventSlotsNeeded += openSlots;
        eventSlotsFilled += filled;
        totalSlotsNeeded += openSlots;
        totalSlotsFilled += filled;

        sessionDateRows.push({
          sessionDateId: sd.id,
          date: dateStr,
          startsAt: sd.starts_at,
          endsAt: sd.ends_at,
          timezone: sd.timezone,
          locationLabel: sd.location_label || locationsJson[0] || ev.event_title,
          ...slotMeta,
          filled,
          openSlots,
          assigned
        });
      }

      const dateRange = sessionDateRows.length
        ? { start: sessionDateRows[0].date, end: sessionDateRows[sessionDateRows.length - 1].date }
        : null;

      events.push({
        requestEventId: ev.request_event_id,
        companyEventId: ev.company_event_id,
        title: ev.event_title,
        locations: locationsJson,
        dateRange,
        slotsFilled: eventSlotsFilled,
        slotsNeeded: eventSlotsNeeded,
        staffAssignedCount: assignedUserIds.size,
        sessionDates: sessionDateRows
      });
    }

    const [submissions] = await pool.execute(
      `SELECT fas.id AS submission_id, fas.user_id, fas.submitted_at, fas.is_on_call,
              u.first_name, u.last_name, u.email
       FROM facilitator_availability_submissions fas
       JOIN users u ON u.id = fas.user_id
       WHERE fas.request_id = ?
       ORDER BY COALESCE(fas.submitted_at, fas.updated_at) ASC`,
      [requestId]
    );

    const submissionIds = submissions.map((s) => s.submission_id);
    let dateEntries = [];
    let locationRanks = [];
    if (submissionIds.length) {
      const ph = submissionIds.map(() => '?').join(',');
      const [deRows] = await pool.execute(
        `SELECT submission_id, user_id, entry_date, availability FROM facilitator_availability_date_entries
         WHERE submission_id IN (${ph})`,
        submissionIds
      );
      dateEntries = deRows || [];
      const [lrRows] = await pool.execute(
        `SELECT submission_id, request_event_id, location, rank_order FROM facilitator_availability_location_ranks
         WHERE submission_id IN (${ph})`,
        submissionIds
      );
      locationRanks = lrRows || [];
    }

    const staffPool = submissions.map((sub) => {
      const userEntries = dateEntries.filter((de) => de.submission_id === sub.submission_id);
      const userRanks = locationRanks.filter((lr) => lr.submission_id === sub.submission_id);
      const perEvent = events.map((ev) => {
        const eventDates = new Set((ev.sessionDates || []).map((sd) => sd.date));
        const totalDays = eventDates.size;
        let daysAvailable = 0;
        for (const d of eventDates) {
          const entry = userEntries.find((de) => toDateOnlyString(de.entry_date) === d);
          if (entry && AVAIL_FOR_STAFFING.has(String(entry.availability))) daysAvailable += 1;
        }
        const rankRows = userRanks.filter((lr) => Number(lr.request_event_id) === Number(ev.requestEventId));
        const locationRank = rankRows.length
          ? Math.min(...rankRows.map((lr) => Number(lr.rank_order) || 99))
          : null;
        const assignedHere = (ev.sessionDates || []).reduce(
          (sum, sd) => sum + (sd.assigned || []).filter((a) => a.userId === sub.user_id).length,
          0
        );
        return {
          companyEventId: ev.companyEventId,
          locationRank,
          daysAvailable,
          totalDays,
          isFullyAvailable: totalDays > 0 && daysAvailable === totalDays,
          assignedSessionCount: assignedHere,
          isFullyAssigned: totalDays > 0 && assignedHere >= totalDays
        };
      });
      return {
        userId: sub.user_id,
        name: personName(sub.first_name, sub.last_name, sub.email),
        email: sub.email,
        submittedAt: sub.submitted_at,
        isSubmitted: !!sub.submitted_at,
        isOnCall: !!sub.is_on_call,
        perEvent
      };
    });

    const staffSubmitted = staffPool.filter((s) => s.isSubmitted).length;
    const staffDraft = staffPool.length - staffSubmitted;

    res.json({
      requestId,
      title: request.title,
      status: request.status,
      tentativeSchedulePostedAt: request.tentative_schedule_posted_at,
      finalSchedulePublishedAt: request.final_schedule_published_at,
      summary: {
        eventCount: events.length,
        staffSubmitted,
        staffDraft,
        staffTotal: staffPool.length,
        slotsFilled: totalSlotsFilled,
        slotsNeeded: totalSlotsNeeded,
        statusCounts,
        eventsWithGaps: events.filter((e) => e.slotsNeeded > 0).length
      },
      events,
      staffPool
    });
  } catch (err) {
    if (String(err?.message || '').includes('assignment_status')) {
      return res.status(503).json({ error: { message: 'Run migration 820_session_provider_assignment_status.sql' } });
    }
    next(err);
  }
};

// ─── Admin: get full scheduling data for a request ────────────────────────────

export const getSchedulingData = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [[request]] = await pool.execute(
      `SELECT id, title, status FROM facilitator_availability_requests WHERE id = ? AND agency_id = ? LIMIT 1`,
      [requestId, agencyId]
    );
    if (!request) return res.status(404).json({ error: { message: 'Not found' } });

    const [reqEvents] = await pool.execute(
      `SELECT fare.id AS request_event_id, fare.company_event_id, fare.display_order,
              ce.title AS event_title, ce.starts_at AS event_date, ce.ends_at AS end_date
       FROM facilitator_availability_request_events fare
       JOIN company_events ce ON ce.id = fare.company_event_id AND ce.is_active = 1
       WHERE fare.request_id = ?
       ORDER BY fare.display_order`,
      [requestId]
    );

    const dateMap = new Map();

    for (const ev of reqEvents) {
      const [sessionDates] = await pool.execute(
        `SELECT id, session_date, starts_at, ends_at, timezone
         FROM company_event_session_dates
         WHERE company_event_id = ?
         ORDER BY session_date, starts_at`,
        [ev.company_event_id]
      );

      for (const sd of sessionDates) {
        const dateStr = toDateOnlyString(sd.session_date) || '';
        if (!dateStr) continue;

        // Group count and participant count (for auto slot rule)
        const [[groupRow]] = await pool.execute(
          `SELECT COUNT(*) AS cnt FROM company_event_session_groups WHERE session_date_id = ?`,
          [sd.id]
        );
        const [[participantRow]] = await pool.execute(
          `SELECT COUNT(*) AS cnt FROM company_event_client_group_assignments WHERE session_date_id = ?`,
          [sd.id]
        );
        const groupCount = Number(groupRow?.cnt ?? 0);
        const participantCount = Number(participantRow?.cnt ?? 0);
        const autoSlots = computeAutoSlots({ groupCount, participantCount });

        // Slot override
        const [[overrideRow]] = await pool.execute(
          `SELECT slot_count FROM facilitator_availability_slot_overrides
           WHERE request_id = ? AND company_event_id = ? AND entry_date = ?
           LIMIT 1`,
          [requestId, ev.company_event_id, dateStr]
        );
        const override = overrideRow ? Number(overrideRow.slot_count) : null;
        const effectiveSlots = override !== null ? override : autoSlots;

        // Assigned employees at this location
        const [assigned] = await pool.execute(
          `SELECT csp.id AS session_provider_id, csp.provider_user_id AS user_id, csp.assignment_status,
                  u.first_name, u.last_name, u.email
           FROM company_event_session_providers csp
           JOIN users u ON u.id = csp.provider_user_id
           WHERE csp.company_event_id = ? AND csp.session_date_id = ?
           ORDER BY u.last_name, u.first_name`,
          [ev.company_event_id, sd.id]
        );

        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, { date: dateStr, locations: [], available: null });
        }

        const dayBlock = dateMap.get(dateStr);
        if (dayBlock.locations.some((l) => l.companyEventId === ev.company_event_id)) {
          continue;
        }

        dayBlock.locations.push({
          requestEventId: ev.request_event_id,
          companyEventId: ev.company_event_id,
          eventTitle: ev.event_title,
          sessionDateId: sd.id,
          startsAt: sd.starts_at,
          endsAt: sd.ends_at,
          timezone: sd.timezone,
          groupCount,
          participantCount,
          autoSlots,
          slotReason: slotReason({ groupCount, participantCount }),
          override,
          effectiveSlots,
          filled: assigned.length,
          openSlots: Math.max(0, effectiveSlots - assigned.length),
          assigned: assigned.map((r) => ({
            sessionProviderId: r.session_provider_id,
            userId: r.user_id,
            name: personName(r.first_name, r.last_name, r.email),
            email: r.email,
            assignmentStatus: String(r.assignment_status || 'draft')
          }))
        });
      }
    }

    // One deduped available pool per calendar date (not per location)
    for (const [dateStr, block] of dateMap) {
      const [availableRows] = await pool.execute(
        `SELECT fade.user_id, fade.availability, fade.waitlist_willing, fade.oncall_willing,
                u.first_name, u.last_name, u.email,
                COALESCE(fas.submitted_at, fas.updated_at, fade.created_at) AS signed_up_at
         FROM facilitator_availability_date_entries fade
         JOIN users u ON u.id = fade.user_id
         LEFT JOIN facilitator_availability_submissions fas ON fas.id = fade.submission_id
         WHERE fade.request_id = ?
           AND fade.entry_date = ?
           AND fade.availability IN ('slot', 'waitlist', 'oncall', 'available')
           AND NOT EXISTS (
             SELECT 1
             FROM company_event_session_providers csp
             JOIN company_event_session_dates cesd ON cesd.id = csp.session_date_id
             JOIN facilitator_availability_request_events fare
               ON fare.company_event_id = cesd.company_event_id AND fare.request_id = ?
             WHERE csp.provider_user_id = fade.user_id
               AND cesd.session_date = fade.entry_date
           )
         ORDER BY
           FIELD(fade.availability, 'slot', 'available', 'waitlist', 'oncall'),
           COALESCE(fas.submitted_at, fas.updated_at, fade.created_at) ASC`,
        [requestId, dateStr, requestId]
      );

      const byUser = new Map();
      for (const r of availableRows) {
        if (byUser.has(r.user_id)) continue;
        byUser.set(r.user_id, {
          userId: r.user_id,
          name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
          email: r.email,
          availability: r.availability,
          waitlistWilling: !!r.waitlist_willing,
          oncallWilling: !!r.oncall_willing,
          signedUpAt: r.signed_up_at
        });
      }
      block.available = [...byUser.values()];
      block.locations.sort((a, b) => String(a.eventTitle).localeCompare(String(b.eventTitle)));
    }

    const dates = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    res.json({ requestId, title: request.title, dates });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: set (or clear) a slot count override for a specific date ──────────

export const setSlotOverride = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [[request]] = await pool.execute(
      `SELECT id FROM facilitator_availability_requests WHERE id = ? AND agency_id = ? LIMIT 1`,
      [requestId, agencyId]
    );
    if (!request) return res.status(404).json({ error: { message: 'Not found' } });

    const { companyEventId, entryDate, slotCount } = req.body;
    const eventId = parseId(companyEventId);
    if (!eventId || !entryDate) return res.status(400).json({ error: { message: 'companyEventId and entryDate are required' } });

    if (slotCount === null || slotCount === undefined) {
      // Clear override
      await pool.execute(
        `DELETE FROM facilitator_availability_slot_overrides
         WHERE request_id = ? AND company_event_id = ? AND entry_date = ?`,
        [requestId, eventId, entryDate]
      );
      return res.json({ ok: true, cleared: true });
    }

    const count = Math.max(0, Number(slotCount));
    await pool.execute(
      `INSERT INTO facilitator_availability_slot_overrides
        (request_id, company_event_id, entry_date, slot_count, overridden_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE slot_count = VALUES(slot_count), overridden_by = VALUES(overridden_by), updated_at = NOW()`,
      [requestId, eventId, entryDate, count, req.user.id]
    );
    res.json({ ok: true, slotCount: count });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: directly assign a facilitator to a session date ───────────────────

export const assignFacilitator = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [[request]] = await pool.execute(
      `SELECT id FROM facilitator_availability_requests WHERE id = ? AND agency_id = ? LIMIT 1`,
      [requestId, agencyId]
    );
    if (!request) return res.status(404).json({ error: { message: 'Not found' } });

    const { companyEventId, sessionDateId, userId: targetUserId } = req.body;
    const eventId = parseId(companyEventId);
    const sdId = parseId(sessionDateId);
    const providerUserId = parseId(targetUserId);
    if (!eventId || !sdId || !providerUserId) {
      return res.status(400).json({ error: { message: 'companyEventId, sessionDateId, and userId are required' } });
    }

    // Get the session date to determine entry_date for slot check
    const [[sdRow]] = await pool.execute(
      `SELECT session_date FROM company_event_session_dates WHERE id = ? AND company_event_id = ? LIMIT 1`,
      [sdId, eventId]
    );
    if (!sdRow) return res.status(404).json({ error: { message: 'Session date not found' } });

    const dateStr = toDateOnlyString(sdRow.session_date) || '';

    // Check slot capacity
    const [[gcRow]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM company_event_session_groups WHERE session_date_id = ?`, [sdId]
    );
    const [[pcRow]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM company_event_client_group_assignments WHERE session_date_id = ?`, [sdId]
    );
    const [[overRow]] = await pool.execute(
      `SELECT slot_count FROM facilitator_availability_slot_overrides
       WHERE request_id = ? AND company_event_id = ? AND entry_date = ? LIMIT 1`,
      [requestId, eventId, dateStr]
    );
    const [[filledRow]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM company_event_session_providers WHERE session_date_id = ?`, [sdId]
    );

    const autoSlots = computeAutoSlots({ groupCount: Number(gcRow?.cnt ?? 0), participantCount: Number(pcRow?.cnt ?? 0) });
    const effectiveSlots = overRow ? Number(overRow.slot_count) : autoSlots;
    const filled = Number(filledRow?.cnt ?? 0);

    // Allow assignment even if "full" — admin may need flexibility; just warn in response
    const overCapacity = filled >= effectiveSlots;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await insertSessionProviderAssignment(conn, {
        agencyId,
        eventId,
        sdId,
        providerUserId,
        assignedByUserId: req.user.id,
        assignmentStatus: 'draft'
      });

      await conn.commit();
      res.json({ ok: true, overCapacity });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
};

// ─── Admin: unassign a facilitator from a session date ────────────────────────

export const unassignFacilitator = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [[request]] = await pool.execute(
      `SELECT id FROM facilitator_availability_requests WHERE id = ? AND agency_id = ? LIMIT 1`,
      [requestId, agencyId]
    );
    if (!request) return res.status(404).json({ error: { message: 'Not found' } });

    const { companyEventId, sessionDateId, userId: targetUserId } = req.body;
    const eventId = parseId(companyEventId);
    const sdId = parseId(sessionDateId);
    const providerUserId = parseId(targetUserId);
    if (!eventId || !sdId || !providerUserId) {
      return res.status(400).json({ error: { message: 'companyEventId, sessionDateId, and userId are required' } });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `DELETE FROM company_event_session_providers
         WHERE company_event_id = ? AND agency_id = ? AND session_date_id = ? AND provider_user_id = ?`,
        [eventId, agencyId, sdId, providerUserId]
      );

      await removeEventProviderIfNoFinalizedSessions(conn, { eventId, providerUserId });

      // Revert any approved request back to pending so the employee can be re-considered
      await conn.execute(
        `UPDATE company_event_session_provider_requests
         SET status = 'pending', decided_by_user_id = NULL, decided_at = NULL
         WHERE company_event_id = ? AND session_date_id = ? AND provider_user_id = ?
           AND status = 'approved'`,
        [eventId, sdId, providerUserId]
      );

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
};

// ─── Admin: assign facilitator to all session dates of an event ───────────────

export const assignFacilitatorToEvent = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const request = await assertRequestInAgency(requestId, agencyId);
    if (!request) return res.status(404).json({ error: { message: 'Not found' } });

    const eventId = parseId(req.body?.companyEventId);
    const providerUserId = parseId(req.body?.userId);
    if (!eventId || !providerUserId) {
      return res.status(400).json({ error: { message: 'companyEventId and userId are required' } });
    }

    const [[fare]] = await pool.execute(
      `SELECT 1 AS ok FROM facilitator_availability_request_events
       WHERE request_id = ? AND company_event_id = ? LIMIT 1`,
      [requestId, eventId]
    );
    if (!fare?.ok) return res.status(404).json({ error: { message: 'Event not in this request' } });

    const [sessionDates] = await pool.execute(
      `SELECT id FROM company_event_session_dates WHERE company_event_id = ? ORDER BY session_date`,
      [eventId]
    );

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      let assignedDates = 0;
      const overCapacityDates = [];
      for (const sd of sessionDates || []) {
        const sdId = sd.id;
        const [[sdRow]] = await conn.execute(
          `SELECT session_date FROM company_event_session_dates WHERE id = ? LIMIT 1`,
          [sdId]
        );
        const dateStr = toDateOnlyString(sdRow?.session_date) || '';
        const slotMeta = await computeSessionSlotMeta({ requestId, companyEventId: eventId, sessionDateId: sdId, sessionDateStr: dateStr });
        const [[filledRow]] = await conn.execute(
          `SELECT COUNT(*) AS cnt FROM company_event_session_providers WHERE session_date_id = ?`,
          [sdId]
        );
        if (Number(filledRow?.cnt || 0) >= slotMeta.effectiveSlots) overCapacityDates.push(dateStr);
        await insertSessionProviderAssignment(conn, {
          agencyId,
          eventId,
          sdId,
          providerUserId,
          assignedByUserId: req.user.id,
          assignmentStatus: 'draft'
        });
        assignedDates += 1;
      }
      await conn.commit();
      res.json({ ok: true, assignedDates, overCapacityDates });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    if (String(err?.message || '').includes('assignment_status')) {
      return res.status(503).json({ error: { message: 'Run migration 820_session_provider_assignment_status.sql' } });
    }
    next(err);
  }
};

// ─── Admin: unassign facilitator from all session dates of an event ───────────

export const unassignFacilitatorFromEvent = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const eventId = parseId(req.body?.companyEventId);
    const providerUserId = parseId(req.body?.userId);
    if (!eventId || !providerUserId) {
      return res.status(400).json({ error: { message: 'companyEventId and userId are required' } });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute(
        `DELETE FROM company_event_session_providers
         WHERE company_event_id = ? AND agency_id = ? AND provider_user_id = ?`,
        [eventId, agencyId, providerUserId]
      );
      await removeEventProviderIfNoFinalizedSessions(conn, { eventId, providerUserId });
      await conn.commit();
      res.json({ ok: true, removedCount: result.affectedRows || 0 });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
};

// ─── Admin: update a single assignment row ────────────────────────────────────

export const updateAssignment = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    const sessionProviderId = parseId(req.params?.sessionProviderId);
    if (!agencyId || !requestId || !sessionProviderId) {
      return res.status(400).json({ error: { message: 'Invalid id' } });
    }
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [[row]] = await pool.execute(
      `SELECT csp.* FROM company_event_session_providers csp
       JOIN facilitator_availability_request_events fare
         ON fare.company_event_id = csp.company_event_id AND fare.request_id = ?
       WHERE csp.id = ? AND csp.agency_id = ? LIMIT 1`,
      [requestId, sessionProviderId, agencyId]
    );
    if (!row) return res.status(404).json({ error: { message: 'Assignment not found' } });

    const nextStatus = String(req.body?.assignmentStatus || '').trim().toLowerCase();
    const validStatuses = new Set(['draft', 'tentative', 'finalized']);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (validStatuses.has(nextStatus) && nextStatus !== String(row.assignment_status)) {
        await conn.execute(
          `UPDATE company_event_session_providers
           SET assignment_status = ?,
               published_at = CASE WHEN ? IN ('tentative', 'finalized') THEN NOW() ELSE NULL END,
               published_by_user_id = CASE WHEN ? IN ('tentative', 'finalized') THEN ? ELSE NULL END
           WHERE id = ?`,
          [nextStatus, nextStatus, nextStatus, req.user.id, sessionProviderId]
        );
        if (nextStatus === 'finalized') {
          await syncEventProviderAssignment(conn, {
            eventId: row.company_event_id,
            providerUserId: row.provider_user_id
          });
        } else if (String(row.assignment_status) === 'finalized') {
          await removeEventProviderIfNoFinalizedSessions(conn, {
            eventId: row.company_event_id,
            providerUserId: row.provider_user_id
          });
        }
      }

      const reassignUserId = parseId(req.body?.reassignUserId);
      if (reassignUserId && reassignUserId !== Number(row.provider_user_id)) {
        await conn.execute(
          `UPDATE company_event_session_providers SET provider_user_id = ? WHERE id = ?`,
          [reassignUserId, sessionProviderId]
        );
      }

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
};

// ─── Admin: publish tentative or finalized schedules ──────────────────────────

export const publishSchedule = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    const requestId = parseId(req.params?.requestId);
    if (!agencyId || !requestId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const request = await assertRequestInAgency(requestId, agencyId);
    if (!request) return res.status(404).json({ error: { message: 'Not found' } });

    const mode = String(req.body?.mode || '').trim().toLowerCase();
    if (!['tentative', 'finalized'].includes(mode)) {
      return res.status(400).json({ error: { message: 'mode must be tentative or finalized' } });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await transitionAssignmentStatus(conn, {
        agencyId,
        requestId,
        requestTitle: request.title,
        mode,
        companyEventId: parseId(req.body?.companyEventId),
        assignmentIds: req.body?.assignmentIds,
        publisherUserId: req.user.id
      });
      await conn.commit();
      res.json({ ok: true, ...result });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    if (String(err?.message || '').includes('assignment_status')) {
      return res.status(503).json({ error: { message: 'Run migration 820_session_provider_assignment_status.sql' } });
    }
    next(err);
  }
};

// ─── Employee: published schedule (tentative + finalized only) ──────────────

export const getMyPublishedSchedule = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthenticated' } });

    const requestId = req.query?.requestId ? parseId(req.query.requestId) : null;
    const params = [userId];
    let requestFilter = '';
    if (requestId) {
      requestFilter = ' AND far.id = ?';
      params.push(requestId);
    }

    const [rows] = await pool.execute(
      `SELECT far.id AS request_id, far.title AS request_title,
              ce.id AS company_event_id, ce.title AS event_title,
              cesd.session_date, cesd.starts_at, cesd.ends_at,
              csp.assignment_status, csp.published_at
       FROM company_event_session_providers csp
       JOIN company_event_session_dates cesd ON cesd.id = csp.session_date_id
       JOIN company_events ce ON ce.id = csp.company_event_id
       JOIN facilitator_availability_request_events fare ON fare.company_event_id = ce.id
       JOIN facilitator_availability_requests far ON far.id = fare.request_id
       WHERE csp.provider_user_id = ?
         AND csp.assignment_status IN ('tentative', 'finalized')
         ${requestFilter}
       ORDER BY far.title, ce.title, cesd.session_date, cesd.starts_at`,
      params
    );

    const byRequest = new Map();
    for (const r of rows || []) {
      const rid = r.request_id;
      if (!byRequest.has(rid)) {
        byRequest.set(rid, {
          requestId: rid,
          requestTitle: r.request_title,
          events: new Map()
        });
      }
      const reqBlock = byRequest.get(rid);
      const eid = r.company_event_id;
      if (!reqBlock.events.has(eid)) {
        reqBlock.events.set(eid, {
          companyEventId: eid,
          eventTitle: r.event_title,
          sessions: []
        });
      }
      reqBlock.events.get(eid).sessions.push({
        date: toDateOnlyString(r.session_date),
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        assignmentStatus: r.assignment_status,
        publishedAt: r.published_at
      });
    }

    const schedules = [...byRequest.values()].map((block) => ({
      requestId: block.requestId,
      requestTitle: block.requestTitle,
      events: [...block.events.values()]
    }));

    res.json(schedules);
  } catch (err) {
    if (String(err?.message || '').includes('assignment_status')) {
      return res.json([]);
    }
    next(err);
  }
};

// ─── Admin: list agency company_events for event picker ───────────────────────

export const listAgencyEvents = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    // Include the full tenant tree so child-agency events/programs are visible.
    const tenantIds = await listAgencyIdsInTenantTree(agencyId);
    const ids = tenantIds.length ? tenantIds : [agencyId];
    const ph = ids.map(() => '?').join(',');

    // Company events
    const [ceRows] = await pool.execute(
      `SELECT ce.id, ce.title, ce.starts_at AS event_date, ce.ends_at AS end_date, ce.event_type,
              a.name AS agency_name,
              COUNT(csd.id) AS session_date_count,
              'company_event' AS _type
       FROM company_events ce
       JOIN agencies a ON a.id = ce.agency_id
       LEFT JOIN company_event_session_dates csd ON csd.company_event_id = ce.id
       WHERE ce.agency_id IN (${ph})
       GROUP BY ce.id
       ORDER BY ce.starts_at DESC`,
      ids
    );

    // Programs (with site names as locations and distinct shift dates as session count)
    const [progRows] = await pool.execute(
      `SELECT p.id, p.name AS title,
              NULL AS event_date, NULL AS end_date,
              'program' AS event_type,
              a.name AS agency_name,
              COUNT(DISTINCT pss.slot_date) AS session_date_count,
              'program' AS _type,
              GROUP_CONCAT(DISTINCT ps.name ORDER BY ps.name SEPARATOR '||') AS site_names_raw
       FROM programs p
       JOIN agencies a ON a.id = p.agency_id
       LEFT JOIN program_sites ps ON ps.program_id = p.id
       LEFT JOIN program_shift_signups pss ON pss.program_site_id = ps.id
       WHERE p.agency_id IN (${ph})
         AND p.is_active = TRUE
       GROUP BY p.id
       ORDER BY p.name ASC`,
      ids
    );

    // Parse site names into arrays so the frontend can use them as default locations
    const programs = progRows.map((r) => ({
      ...r,
      site_names: r.site_names_raw ? r.site_names_raw.split('||') : [],
      site_names_raw: undefined
    }));

    res.json([...ceRows, ...programs]);
  } catch (err) {
    next(err);
  }
};

// ── getLocationDistances ───────────────────────────────────────────────────────
// Returns driving distance/duration from the authenticated user's home address
// to each unique (label, address) pair in the request's session dates.
export const getLocationDistances = async (req, res, next) => {
  try {
    const requestId = parseId(req.params.requestId);
    const userId    = req.user?.id;
    if (!requestId || !userId) return res.status(400).json({ error: 'Bad request' });

    // Pull unique location labels + addresses from the request (active events only).
    // Use session-date address first; fall back to the event-level address.
    const [locRows] = await pool.execute(
      `SELECT DISTINCT
         COALESCE(cesd.location_label, ce.title) AS location_label,
         COALESCE(
           NULLIF(cesd.location_address, ''),
           NULLIF(ce.event_location_address, ''),
           NULLIF(ce.public_location_address, '')
         ) AS location_address
       FROM facilitator_availability_request_events fare
       JOIN company_events ce ON ce.id = fare.company_event_id AND ce.is_active = 1
       JOIN company_event_session_dates cesd ON cesd.company_event_id = fare.company_event_id
       WHERE fare.request_id = ?
         AND COALESCE(
           NULLIF(cesd.location_address, ''),
           NULLIF(ce.event_location_address, ''),
           NULLIF(ce.public_location_address, '')
         ) IS NOT NULL`,
      [requestId]
    );

    // Get user home address
    const [[userRow]] = await pool.execute(
      `SELECT home_street_address, home_address_line2, home_city, home_state, home_postal_code
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    const origin = [
      userRow?.home_street_address,
      userRow?.home_city,
      userRow?.home_state,
      userRow?.home_postal_code
    ].filter(Boolean).join(', ');

    // If no API key or no home address, return locations without distance
    const apiKey = config?.googleMaps?.apiKey;
    if (!apiKey || !origin || !locRows.length) {
      return res.json(locRows.map(r => ({
        label:    r.location_label,
        address:  r.location_address,
        distance: null,
        duration: null
      })));
    }

    // Deduplicate by address
    const unique = [];
    const seen = new Set();
    for (const r of locRows) {
      const addr = String(r.location_address || '').trim();
      if (addr && !seen.has(addr)) {
        seen.add(addr);
        unique.push(r);
      }
    }

    // Call Google Distance Matrix API
    const destinations = unique.map(r => encodeURIComponent(r.location_address)).join('|');
    const originEnc    = encodeURIComponent(origin);
    const gmUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originEnc}&destinations=${destinations}&mode=driving&units=imperial&key=${apiKey}`;

    const gmData = await new Promise((resolve, reject) => {
      https.get(gmUrl, (gmRes) => {
        let body = '';
        gmRes.on('data', d => { body += d; });
        gmRes.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });

    const elements = gmData?.rows?.[0]?.elements || [];
    const result = unique.map((r, i) => ({
      label:    r.location_label,
      address:  r.location_address,
      distance: elements[i]?.distance?.text || null,
      duration: elements[i]?.duration?.text || null
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
};
