import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';

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
          const eventId = parseId(ev?.companyEventId ?? ev?.company_event_id ?? ev?.id);
          if (!eventId) continue;
          const locs = Array.isArray(ev?.locations) ? ev.locations : [];
          await conn.execute(
            `INSERT INTO facilitator_availability_request_events
              (request_id, company_event_id, locations_json, display_order)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE locations_json = VALUES(locations_json), display_order = VALUES(display_order)`,
            [requestId, eventId, JSON.stringify(locs), i]
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
      `SELECT fare.*, ce.title AS event_title, ce.event_date, ce.end_date
       FROM facilitator_availability_request_events fare
       JOIN company_events ce ON ce.id = fare.company_event_id
       WHERE fare.request_id = ?
       ORDER BY fare.display_order`,
      [requestId]
    );

    // Hydrate session dates for each event
    for (const re of reqEvents) {
      re.locations_json = parseJson(re.locations_json) || [];
      const [dates] = await pool.execute(
        `SELECT id, session_date, starts_at, ends_at, timezone, location_label, location_address
         FROM company_event_session_dates
         WHERE company_event_id = ?
         ORDER BY session_date, starts_at`,
        [re.company_event_id]
      );
      re.session_dates = dates;
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
      `SELECT fare.*, ce.title AS event_title, ce.event_date, ce.end_date
       FROM facilitator_availability_request_events fare
       JOIN company_events ce ON ce.id = fare.company_event_id
       WHERE fare.request_id = ?
       ORDER BY fare.display_order`,
      [requestId]
    );

    for (const re of reqEvents) {
      re.locations_json = parseJson(re.locations_json) || [];
      const [dates] = await pool.execute(
        `SELECT id, session_date, starts_at, ends_at, timezone, location_label, location_address
         FROM company_event_session_dates
         WHERE company_event_id = ?
         ORDER BY session_date, starts_at`,
        [re.company_event_id]
      );
      re.session_dates = dates;
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
      for (const de of dateEntries) {
        const eventId = parseId(de?.companyEventId ?? de?.company_event_id);
        if (!eventId || !de?.entryDate) continue;
        await conn.execute(
          `INSERT INTO facilitator_availability_date_entries
            (submission_id, request_id, user_id, company_event_id, session_date_id, entry_date, availability, comment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            submissionId,
            requestId,
            userId,
            eventId,
            parseId(de?.sessionDateId ?? de?.session_date_id) || null,
            de.entryDate,
            ['available', 'waitlist', 'unavailable'].includes(de?.availability) ? de.availability : 'unavailable',
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

// ─── Admin: list agency company_events for event picker ───────────────────────

export const listAgencyEvents = async (req, res, next) => {
  try {
    const agencyId = parseId(req.params?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!(await canManage(req, agencyId))) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      `SELECT ce.id, ce.title, ce.event_date, ce.end_date, ce.event_type,
              COUNT(csd.id) AS session_date_count
       FROM company_events ce
       LEFT JOIN company_event_session_dates csd ON csd.company_event_id = ce.id
       WHERE ce.agency_id = ?
       GROUP BY ce.id
       ORDER BY ce.event_date DESC`,
      [agencyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};
