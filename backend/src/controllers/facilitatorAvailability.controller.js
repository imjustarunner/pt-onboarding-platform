import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';
import { listAgencyIdsInTenantTree } from '../utils/meDashboardTenantScope.js';

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
              CASE WHEN fare.program_id IS NOT NULL THEN 'program' ELSE 'company_event' END AS _type
       FROM facilitator_availability_request_events fare
       LEFT JOIN company_events ce ON ce.id = fare.company_event_id
       LEFT JOIN programs p ON p.id = fare.program_id
       WHERE fare.request_id = ?
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
        ? { ...submission, dateEntries, locationRanks }
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
      for (const de of dateEntries) {
        const isProgram = !!de?.programId || !!de?.program_id;
        const eventId = isProgram ? null : parseId(de?.companyEventId ?? de?.company_event_id);
        const programId = isProgram ? parseId(de?.programId ?? de?.program_id) : null;
        if (!eventId && !programId) continue;
        if (!de?.entryDate) continue;
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
            de.entryDate,
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
      for (const lr of locationRanks) {
        const reqEventId = parseId(lr?.requestEventId ?? lr?.request_event_id);
        if (!reqEventId || !lr?.location) continue;
        await conn.execute(
          `INSERT INTO facilitator_availability_location_ranks
            (submission_id, request_event_id, location, rank_order)
           VALUES (?, ?, ?, ?)`,
          [
            submissionId,
            reqEventId,
            String(lr.location).trim(),
            Math.max(1, Number(lr?.rankOrder ?? lr?.rank_order ?? 1))
          ]
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
       JOIN company_events ce ON ce.id = fare.company_event_id
       WHERE fare.request_id = ?
       ORDER BY fare.display_order`,
      [requestId]
    );

    const result = [];

    for (const ev of reqEvents) {
      const [sessionDates] = await pool.execute(
        `SELECT id, session_date, starts_at, ends_at, timezone
         FROM company_event_session_dates
         WHERE company_event_id = ?
         ORDER BY session_date, starts_at`,
        [ev.company_event_id]
      );

      const dates = [];

      for (const sd of sessionDates) {
        const dateStr = sd.session_date instanceof Date
          ? sd.session_date.toISOString().slice(0, 10)
          : String(sd.session_date || '').slice(0, 10);

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

        // Assigned employees
        const [assigned] = await pool.execute(
          `SELECT csp.provider_user_id AS user_id, u.first_name, u.last_name, u.email
           FROM company_event_session_providers csp
           JOIN users u ON u.id = csp.provider_user_id
           WHERE csp.company_event_id = ? AND csp.session_date_id = ?
           ORDER BY u.last_name, u.first_name`,
          [ev.company_event_id, sd.id]
        );

        // Available pool: responded available/waitlist AND not already assigned to this session date
        const [available] = await pool.execute(
          `SELECT fade.user_id, fade.availability, fade.waitlist_willing, fade.oncall_willing,
                  u.first_name, u.last_name, u.email,
                  COALESCE(fas.submitted_at, fas.updated_at, fade.created_at) AS signed_up_at
           FROM facilitator_availability_date_entries fade
           JOIN users u ON u.id = fade.user_id
           LEFT JOIN facilitator_availability_submissions fas
             ON fas.id = fade.submission_id
           LEFT JOIN company_event_session_providers csp
             ON csp.session_date_id = ? AND csp.provider_user_id = fade.user_id
           WHERE fade.request_id = ?
             AND fade.company_event_id = ?
             AND fade.entry_date = ?
             AND fade.availability IN ('slot', 'waitlist', 'oncall', 'available')
             AND csp.id IS NULL
           ORDER BY
             FIELD(fade.availability, 'slot', 'available', 'waitlist', 'oncall'),
             COALESCE(fas.submitted_at, fas.updated_at, fade.created_at) ASC`,
          [sd.id, requestId, ev.company_event_id, dateStr]
        );

        dates.push({
          sessionDateId: sd.id,
          date: dateStr,
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
          assigned: assigned.map((r) => ({
            userId: r.user_id,
            name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
            email: r.email
          })),
          available: available.map((r) => ({
            userId: r.user_id,
            name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
            email: r.email,
            availability: r.availability
          }))
        });
      }

      result.push({
        requestEventId: ev.request_event_id,
        companyEventId: ev.company_event_id,
        eventTitle: ev.event_title,
        eventDate: ev.event_date,
        endDate: ev.end_date,
        dates
      });
    }

    res.json({ requestId, title: request.title, events: result });
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

    const dateStr = sdRow.session_date instanceof Date
      ? sdRow.session_date.toISOString().slice(0, 10)
      : String(sdRow.session_date || '').slice(0, 10);

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

      await conn.execute(
        `INSERT INTO company_event_session_providers
          (company_event_id, agency_id, session_date_id, provider_user_id, assigned_by_user_id, assigned_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE assigned_by_user_id = VALUES(assigned_by_user_id), assigned_at = NOW()`,
        [eventId, agencyId, sdId, providerUserId, req.user.id]
      );

      // If there's a pending/waitlist request for this provider+session, mark it approved
      await conn.execute(
        `UPDATE company_event_session_provider_requests
         SET status = 'approved', decided_by_user_id = ?, decided_at = NOW()
         WHERE company_event_id = ? AND session_date_id = ? AND provider_user_id = ?
           AND status IN ('pending', 'waitlist')`,
        [req.user.id, eventId, sdId, providerUserId]
      );

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
