/**
 * Agency-wide school-events kiosk: one PIN unlocks a station that lists
 * school portal events; staff pick an event and clock in/out (payroll punches).
 */
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import config from '../config/config.js';
import KioskModel from '../models/Kiosk.model.js';
import {
  recordEventEmployeeClockIn,
  recordEventEmployeeClockOut,
  providerOnEventStaffRoster
} from '../services/skillBuildersEventKioskPunch.service.js';
import { isSchoolPortalEventType } from '../services/companyEventAccess.service.js';
import { SCHOOL_PORTAL_EVENT_TYPES } from '../services/schoolPortalEvents.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

const TOKEN_TYPE = 'school_events_kiosk';
const KIND = 'school_events';

const KIOSK_STAFF_ACTIVE_USER_SQL =
  `(u.status = 'ACTIVE_EMPLOYEE' OR LOWER(COALESCE(u.status, '')) = 'active')`;

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** Agency school-events hub PIN: 4–6 digits (ITSCO uses 5373). */
function normalizeEventKioskPin(pin) {
  const p = String(pin || '').trim();
  return /^\d{4,6}$/.test(p) ? p : null;
}

function normalizeStaffKioskPin(pin) {
  const p = String(pin || '').trim();
  return /^\d{4}$/.test(p) ? p : null;
}

function kioskIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || null;
}

function utcDateToZonedYmd(date, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'America/Denver',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date instanceof Date ? date : new Date(date));
  } catch {
    const d = date instanceof Date ? date : new Date(date);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
  }
}

function addDaysYmd(ymd, deltaDays) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Number(deltaDays || 0));
  return d.toISOString().slice(0, 10);
}

function signSchoolEventsKioskToken({ agencyId }) {
  return jwt.sign(
    { type: TOKEN_TYPE, agencyId, kind: KIND },
    config.jwt.secret,
    { expiresIn: '14h' }
  );
}

function verifySchoolEventsKioskBearer(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) return { error: { status: 401, message: 'Missing kiosk session' } };
  const token = h.slice(7).trim();
  if (!token) return { error: { status: 401, message: 'Missing kiosk session' } };
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded.type !== TOKEN_TYPE || decoded.kind !== KIND) {
      return { error: { status: 401, message: 'Invalid kiosk session' } };
    }
    const agencyId = parsePositiveInt(decoded.agencyId);
    if (!agencyId) return { error: { status: 401, message: 'Invalid kiosk session' } };
    return { ok: true, agencyId };
  } catch {
    return { error: { status: 401, message: 'Kiosk session expired or invalid' } };
  }
}

async function resolveAgencyIdBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return null;
  const [orgs] = await pool.execute(
    `SELECT id FROM agencies WHERE LOWER(slug) = ? AND (is_archived = FALSE OR is_archived IS NULL) LIMIT 1`,
    [s]
  );
  if (orgs?.[0]?.id) return Number(orgs[0].id);
  const [byPortal] = await pool.execute(
    `SELECT id FROM agencies WHERE LOWER(portal_url) = ? AND (is_archived = FALSE OR is_archived IS NULL) LIMIT 1`,
    [s]
  );
  return byPortal?.[0]?.id ? Number(byPortal[0].id) : null;
}

async function assertTokenMatchesSlug(ctx, slug) {
  const slugAgencyId = await resolveAgencyIdBySlug(slug);
  if (!slugAgencyId) return { error: { status: 404, message: 'Agency not found' } };
  if (slugAgencyId !== ctx.agencyId) {
    return { error: { status: 403, message: 'Kiosk session does not match this portal' } };
  }
  return { ok: true, agencyId: ctx.agencyId };
}

async function loadSchoolEventForAgency(agencyId, eventId) {
  const eid = parsePositiveInt(eventId);
  const aid = parsePositiveInt(agencyId);
  if (!eid || !aid) return null;
  const [rows] = await pool.execute(
    `SELECT ce.id, ce.agency_id, ce.organization_id, ce.title, ce.event_type,
            ce.starts_at, ce.ends_at, ce.timezone, ce.is_active, ce.school_event_status,
            ce.employee_report_time, ce.skill_builder_direct_hours,
            a.name AS school_name
     FROM company_events ce
     LEFT JOIN agencies a ON a.id = ce.organization_id
     WHERE ce.id = ? AND ce.agency_id = ? LIMIT 1`,
    [eid, aid]
  );
  const row = rows?.[0] || null;
  if (!row || !isSchoolPortalEventType(row.event_type)) return null;
  return row;
}

function eventAllowsPunchToday(eventRow) {
  const tz = String(eventRow?.timezone || 'America/Denver').trim() || 'America/Denver';
  const todayYmd = utcDateToZonedYmd(new Date(), tz);
  const startYmd = eventRow?.starts_at ? utcDateToZonedYmd(new Date(eventRow.starts_at), tz) : '';
  const endYmd = eventRow?.ends_at
    ? utcDateToZonedYmd(new Date(eventRow.ends_at), tz)
    : startYmd;
  if (!startYmd) return { ok: false, todayYmd, timezone: tz };
  const from = addDaysYmd(startYmd, -1);
  const to = addDaysYmd(endYmd || startYmd, 1);
  const ok = todayYmd >= from && todayYmd <= to;
  return { ok, todayYmd, timezone: tz, startYmd, endYmd };
}

async function loadEventStaff(eventId) {
  const eid = parsePositiveInt(eventId);
  if (!eid) return [];
  const sql = `
    SELECT DISTINCT u.id, u.first_name, u.last_name, u.profile_photo_path
    FROM (
      SELECT cepa.provider_user_id AS uid
      FROM company_event_provider_assignments cepa
      WHERE cepa.company_event_id = ?
      UNION
      SELECT cesp.provider_user_id AS uid
      FROM company_event_session_providers cesp
      WHERE cesp.company_event_id = ?
    ) roster
    INNER JOIN users u ON u.id = roster.uid
    WHERE ${KIOSK_STAFF_ACTIVE_USER_SQL}
    ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`;
  try {
    const [rows] = await pool.execute(sql, [eid, eid]);
    return rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function syncEmployeeCheckin({ agencyId, eventId, userId, kioskDate, ip }) {
  try {
    await pool.execute(
      `INSERT INTO event_day_kiosk_checkins
         (company_event_id, agency_id, user_id, person_type, action, checked_in_at, kiosk_date, ip_address)
       VALUES (?, ?, ?, 'employee', 'check_in', NOW(), ?, ?)`,
      [eventId, agencyId, userId, kioskDate, ip]
    );
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return { ok: false, tableMissing: true };
    }
    // Duplicate check-in for the day is fine; still ensure punch exists.
    if (err?.code !== 'ER_DUP_ENTRY') throw err;
  }

  const punch = await recordEventEmployeeClockIn(pool, {
    agencyId,
    eventId,
    userId,
    kioskDateYmd: kioskDate,
    source: 'school_events_kiosk'
  });
  if (punch.error && punch.error.status !== 409) {
    return { ok: false, error: punch.error };
  }
  return {
    ok: true,
    punchId: punch.punchId || null,
    alreadyClockedIn: punch.error?.status === 409
  };
}

async function syncEmployeeCheckout({ agencyId, eventId, userId, kioskDate }) {
  await pool.execute(
    `UPDATE event_day_kiosk_checkins
     SET action = 'check_out', checked_out_at = NOW(), updated_at = NOW()
     WHERE company_event_id = ? AND user_id = ? AND kiosk_date = ? AND person_type = 'employee'`,
    [eventId, userId, kioskDate]
  ).catch(() => null);

  const punch = await recordEventEmployeeClockOut(pool, {
    agencyId,
    eventId,
    userId,
    source: 'school_events_kiosk'
  });
  if (punch.error) return { ok: false, error: punch.error };
  return { ok: true, ...punch };
}

/** POST /api/public/school-events/agency/:slug/kiosk/unlock */
export const unlockSchoolEventsKiosk = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const agencyId = await resolveAgencyIdBySlug(slug);
    if (!agencyId) return res.status(404).json({ error: { message: 'Agency not found' } });

    const pin = normalizeEventKioskPin(req.body?.pin);
    if (!pin) return res.status(400).json({ error: { message: 'Enter the 4–6 digit station PIN' } });
    const pinHash = KioskModel.hashPin(pin);

    const [rows] = await pool.execute(
      `SELECT id, school_events_kiosk_pin_hash FROM agencies WHERE id = ? LIMIT 1`,
      [agencyId]
    ).catch((e) => {
      if (e?.code === 'ER_BAD_FIELD_ERROR') return [[{}]];
      throw e;
    });
    const stored = String(rows?.[0]?.school_events_kiosk_pin_hash || '');
    if (!stored || stored !== pinHash) {
      return res.status(401).json({ error: { message: 'PIN not recognized for this portal' } });
    }

    const token = signSchoolEventsKioskToken({ agencyId });
    res.json({
      ok: true,
      token,
      agencyId,
      kind: KIND
    });
  } catch (e) {
    next(e);
  }
};

/** GET /api/public/school-events/agency/:slug/kiosk/events */
export const listSchoolEventsKioskEvents = async (req, res, next) => {
  try {
    const ctx = verifySchoolEventsKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlug(ctx, req.params.slug);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const typeList = [...SCHOOL_PORTAL_EVENT_TYPES];
    const placeholders = typeList.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT ce.id, ce.title, ce.event_type, ce.starts_at, ce.ends_at, ce.timezone,
              ce.school_event_status, ce.employee_report_time, ce.is_active,
              a.name AS school_name
       FROM company_events ce
       LEFT JOIN agencies a ON a.id = ce.organization_id
       WHERE ce.agency_id = ?
         AND ce.is_active = 1
         AND ce.event_type IN (${placeholders})
         AND COALESCE(ce.school_event_status, 'scheduled') <> 'canceled'
         AND ce.starts_at >= (UTC_TIMESTAMP() - INTERVAL 2 DAY)
         AND ce.starts_at <= (UTC_TIMESTAMP() + INTERVAL 2 DAY)
       ORDER BY ce.starts_at ASC
       LIMIT 80`,
      [m.agencyId, ...typeList]
    );

    const events = (rows || [])
      .map((r) => {
        const day = eventAllowsPunchToday(r);
        return {
          id: Number(r.id),
          title: r.title || 'School event',
          eventType: r.event_type,
          schoolName: r.school_name || null,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          timezone: r.timezone || 'America/Denver',
          employeeReportTime: r.employee_report_time != null && r.employee_report_time !== ''
            ? String(r.employee_report_time).slice(0, 8)
            : null,
          schoolEventStatus: String(r.school_event_status || 'scheduled'),
          punchAllowedToday: !!day.ok,
          todayYmd: day.todayYmd
        };
      })
      .filter((e) => e.punchAllowedToday || true);

    res.json({ ok: true, agencyId: m.agencyId, events });
  } catch (e) {
    next(e);
  }
};

/** GET /api/public/school-events/agency/:slug/kiosk/events/:eventId/staff */
export const listSchoolEventsKioskStaff = async (req, res, next) => {
  try {
    const ctx = verifySchoolEventsKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlug(ctx, req.params.slug);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const ev = await loadSchoolEventForAgency(m.agencyId, req.params.eventId);
    if (!ev) return res.status(404).json({ error: { message: 'School event not found' } });

    const staffRows = await loadEventStaff(ev.id);
    const staff = staffRows.map((u) => ({
      id: Number(u.id),
      firstName: u.first_name || '',
      lastName: u.last_name || '',
      displayName: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      profilePhotoUrl: publicUploadsUrlFromStoredPath(u.profile_photo_path || null)
    }));

    const day = eventAllowsPunchToday(ev);
    res.json({
      ok: true,
      eventId: Number(ev.id),
      eventTitle: ev.title || 'School event',
      schoolName: ev.school_name || null,
      startsAt: ev.starts_at,
      endsAt: ev.ends_at,
      timezone: ev.timezone,
      employeeReportTime: ev.employee_report_time != null && ev.employee_report_time !== ''
        ? String(ev.employee_report_time).slice(0, 8)
        : null,
      punchAllowedToday: !!day.ok,
      todayYmd: day.todayYmd,
      staff
    });
  } catch (e) {
    next(e);
  }
};

/** POST …/events/:eventId/checkin/employee */
export const schoolEventsKioskEmployeeCheckin = async (req, res, next) => {
  try {
    const ctx = verifySchoolEventsKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlug(ctx, req.params.slug);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const ev = await loadSchoolEventForAgency(m.agencyId, req.params.eventId);
    if (!ev) return res.status(404).json({ error: { message: 'School event not found' } });
    const day = eventAllowsPunchToday(ev);
    if (!day.ok) {
      return res.status(403).json({
        error: { message: 'Clock-in is only available around the event date', code: 'KIOSK_NOT_EVENT_DAY' }
      });
    }

    const userId = parsePositiveInt(req.body?.userId);
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });
    if (!(await providerOnEventStaffRoster(userId, ev.id, m.agencyId))) {
      return res.status(403).json({ error: { message: 'Employee is not assigned to this event' } });
    }

    const result = await syncEmployeeCheckin({
      agencyId: m.agencyId,
      eventId: Number(ev.id),
      userId,
      kioskDate: day.todayYmd,
      ip: kioskIp(req)
    });
    if (result.tableMissing) {
      return res.status(503).json({ error: { message: 'Run migration 615 for event-day check-ins' } });
    }
    if (!result.ok) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }

    res.status(201).json({
      ok: true,
      userId,
      checkedInAt: new Date().toISOString(),
      punchId: result.punchId,
      alreadyClockedIn: !!result.alreadyClockedIn
    });
  } catch (e) {
    next(e);
  }
};

/** POST …/events/:eventId/checkin/employee-pin */
export const schoolEventsKioskEmployeeCheckinByPin = async (req, res, next) => {
  try {
    const ctx = verifySchoolEventsKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlug(ctx, req.params.slug);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const ev = await loadSchoolEventForAgency(m.agencyId, req.params.eventId);
    if (!ev) return res.status(404).json({ error: { message: 'School event not found' } });
    const day = eventAllowsPunchToday(ev);
    if (!day.ok) {
      return res.status(403).json({
        error: { message: 'Clock-in is only available around the event date', code: 'KIOSK_NOT_EVENT_DAY' }
      });
    }

    const pin = normalizeStaffKioskPin(req.body?.pin);
    if (!pin) return res.status(400).json({ error: { message: 'Enter your 4-digit personal kiosk PIN' } });
    const pinHash = KioskModel.hashPin(pin);

    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name
       FROM users u
       JOIN user_preferences up ON up.user_id = u.id AND up.kiosk_pin_hash = ?
       JOIN (
         SELECT cepa.provider_user_id AS uid FROM company_event_provider_assignments cepa
         WHERE cepa.company_event_id = ?
         UNION
         SELECT cesp.provider_user_id AS uid FROM company_event_session_providers cesp
         WHERE cesp.company_event_id = ?
       ) roster ON roster.uid = u.id
       WHERE ${KIOSK_STAFF_ACTIVE_USER_SQL}`,
      [pinHash, ev.id, ev.id]
    ).catch((err) => {
      if (err?.code === 'ER_NO_SUCH_TABLE') return [[]];
      throw err;
    });

    if (!rows?.length) {
      return res.status(404).json({ error: { message: 'No employee on this event roster matches that PIN' } });
    }
    if (rows.length > 1) {
      return res.status(400).json({ error: { message: 'Multiple employees share this PIN. Tap your name instead.' } });
    }

    const user = rows[0];
    const result = await syncEmployeeCheckin({
      agencyId: m.agencyId,
      eventId: Number(ev.id),
      userId: Number(user.id),
      kioskDate: day.todayYmd,
      ip: kioskIp(req)
    });
    if (result.tableMissing) {
      return res.status(503).json({ error: { message: 'Run migration 615 for event-day check-ins' } });
    }
    if (!result.ok) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }

    res.status(201).json({
      ok: true,
      userId: Number(user.id),
      displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      checkedInAt: new Date().toISOString(),
      punchId: result.punchId,
      alreadyClockedIn: !!result.alreadyClockedIn
    });
  } catch (e) {
    next(e);
  }
};

/** POST …/events/:eventId/checkout/employee */
export const schoolEventsKioskEmployeeCheckout = async (req, res, next) => {
  try {
    const ctx = verifySchoolEventsKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlug(ctx, req.params.slug);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const ev = await loadSchoolEventForAgency(m.agencyId, req.params.eventId);
    if (!ev) return res.status(404).json({ error: { message: 'School event not found' } });
    const day = eventAllowsPunchToday(ev);

    const userId = parsePositiveInt(req.body?.userId);
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });

    const result = await syncEmployeeCheckout({
      agencyId: m.agencyId,
      eventId: Number(ev.id),
      userId,
      kioskDate: day.todayYmd
    });
    if (!result.ok) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }

    res.json({
      ok: true,
      userId,
      checkedOutAt: new Date().toISOString(),
      directHours: result.directHours,
      indirectHours: result.indirectHours,
      workedHours: result.workedHours,
      directClaimId: result.directClaimId,
      indirectClaimId: result.indirectClaimId
    });
  } catch (e) {
    next(e);
  }
};
