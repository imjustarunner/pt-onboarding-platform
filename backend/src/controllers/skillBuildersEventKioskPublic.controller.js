import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import config from '../config/config.js';
import KioskModel from '../models/Kiosk.model.js';
import {
  recordSkillBuilderEventClockIn,
  recordSkillBuilderEventClockOut
} from '../services/skillBuildersEventKioskPunch.service.js';

const TOKEN_TYPE = 'skill_builders_event_kiosk';

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

function normalizeEventKioskPin(pin) {
  const p = String(pin || '').trim();
  return /^\d{6}$/.test(p) ? p : null;
}

function normalizeStaffKioskPin(pin) {
  const p = String(pin || '').trim();
  return /^\d{4}$/.test(p) ? p : null;
}

function signSkillBuildersEventKioskToken({ agencyId, companyEventId }) {
  return jwt.sign(
    { type: TOKEN_TYPE, agencyId, companyEventId },
    config.jwt.secret,
    { expiresIn: '14h' }
  );
}

function verifySkillBuildersEventKioskBearer(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) return { error: { status: 401, message: 'Missing kiosk session' } };
  const token = h.slice(7).trim();
  if (!token) return { error: { status: 401, message: 'Missing kiosk session' } };
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded.type !== TOKEN_TYPE) return { error: { status: 401, message: 'Invalid kiosk session' } };
    const agencyId = parsePositiveInt(decoded.agencyId);
    const companyEventId = parsePositiveInt(decoded.companyEventId);
    if (!agencyId || !companyEventId) return { error: { status: 401, message: 'Invalid kiosk session' } };
    return { ok: true, agencyId, companyEventId };
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
  return orgs?.[0]?.id ? Number(orgs[0].id) : null;
}

async function assertTokenMatchesSlugAndEvent(ctx, slug, eventIdParam) {
  const slugAgencyId = await resolveAgencyIdBySlug(slug);
  if (!slugAgencyId) return { error: { status: 404, message: 'Agency not found' } };
  if (slugAgencyId !== ctx.agencyId) return { error: { status: 403, message: 'Kiosk session does not match this portal' } };
  const eid = parsePositiveInt(eventIdParam);
  if (!eid || eid !== ctx.companyEventId) return { error: { status: 403, message: 'Kiosk session does not match this event' } };
  return { ok: true, agencyId: ctx.agencyId, eventId: eid };
}

/** POST /api/public/skill-builders/agency/:slug/kiosk/unlock */
export const unlockSkillBuildersEventKiosk = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const agencyId = await resolveAgencyIdBySlug(slug);
    if (!agencyId) return res.status(404).json({ error: { message: 'Agency not found' } });

    const pin = normalizeEventKioskPin(req.body?.pin);
    if (!pin) return res.status(400).json({ error: { message: 'Enter the 6-digit station PIN' } });

    const pinHash = KioskModel.hashPin(pin);
    const [rows] = await pool.execute(
      `SELECT id, title, agency_id, kiosk_event_pin_hash
       FROM company_events
       WHERE agency_id = ?
         AND (is_active = TRUE OR is_active IS NULL)
         AND LOWER(COALESCE(event_type, '')) = 'skills_group'
         AND kiosk_event_pin_hash IS NOT NULL`,
      [agencyId]
    );

    const matches = (rows || []).filter((r) => String(r.kiosk_event_pin_hash || '') === pinHash);
    if (!matches.length) {
      return res.status(401).json({ error: { message: 'PIN not recognized for this portal' } });
    }
    if (matches.length > 1) {
      return res.status(409).json({
        error: {
          message:
            'This PIN matches more than one event. Ask an administrator to set unique station PINs per school program.'
        }
      });
    }

    const ev = matches[0];
    const eventId = Number(ev.id);
    const token = signSkillBuildersEventKioskToken({ agencyId, companyEventId: eventId });
    res.json({
      ok: true,
      token,
      agencyId,
      eventId,
      eventTitle: ev.title || 'Skill Builders event'
    });
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' && String(e?.sqlMessage || '').includes('kiosk_event_pin_hash')) {
      return res.status(503).json({ error: { message: 'Run migration 588 for kiosk station PIN' } });
    }
    next(e);
  }
};

/** GET /api/public/skill-builders/agency/:slug/kiosk/events/:eventId/meta */
export const getSkillBuildersEventKioskMeta = async (req, res, next) => {
  try {
    const ctx = verifySkillBuildersEventKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const [r] = await pool.execute(
      `SELECT id, title FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1`,
      [m.eventId, m.agencyId]
    );
    const row = r?.[0];
    if (!row) return res.status(404).json({ error: { message: 'Event not found' } });
    res.json({
      ok: true,
      eventId: Number(row.id),
      eventTitle: row.title || 'Skill Builders event'
    });
  } catch (e) {
    next(e);
  }
};

/** GET /api/public/skill-builders/agency/:slug/kiosk/events/:eventId/sessions */
export const listSkillBuildersEventKioskSessions = async (req, res, next) => {
  try {
    const ctx = verifySkillBuildersEventKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const fromY = String(req.query.from || '').trim().slice(0, 10);
    const toY = String(req.query.to || '').trim().slice(0, 10);
    let sql = `
      SELECT s.id, s.session_date, s.starts_at, s.ends_at, s.timezone,
             m.weekday, m.start_time, m.end_time
      FROM skill_builders_event_sessions s
      INNER JOIN skills_group_meetings m ON m.id = s.skills_group_meeting_id
      WHERE s.company_event_id = ?`;
    const params = [m.eventId];
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromY)) {
      sql += ' AND s.session_date >= ?';
      params.push(fromY);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(toY)) {
      sql += ' AND s.session_date <= ?';
      params.push(toY);
    }
    sql += ' ORDER BY s.session_date ASC, m.start_time ASC, s.id ASC LIMIT 120';
    const [rows] = await pool.execute(sql, params);
    const sessions = (rows || []).map((r) => ({
      id: Number(r.id),
      sessionDate: r.session_date,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      timezone: r.timezone || 'UTC',
      weekday: r.weekday,
      startTime: String(r.start_time || '').slice(0, 8),
      endTime: String(r.end_time || '').slice(0, 8)
    }));
    res.json({ sessions });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Sessions table not migrated' } });
    }
    next(e);
  }
};

/** GET /api/public/skill-builders/agency/:slug/kiosk/events/:eventId/roster */
export const listSkillBuildersEventKioskRoster = async (req, res, next) => {
  try {
    const ctx = verifySkillBuildersEventKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const eid = m.eventId;
    const aid = m.agencyId;
    const [prov] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name
       FROM skills_group_providers sgp
       INNER JOIN users u ON u.id = sgp.provider_user_id
       INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id
       WHERE sg.company_event_id = ? AND sg.agency_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [eid, aid]
    );
    const [cli] = await pool.execute(
      `SELECT c.id, c.initials, c.identifier_code
       FROM skills_group_clients sgc
       INNER JOIN clients c ON c.id = sgc.client_id
       INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id
       WHERE sg.company_event_id = ? AND sg.agency_id = ?
       ORDER BY c.initials ASC, c.id ASC
       LIMIT 500`,
      [eid, aid]
    );
    res.json({
      providers: (prov || []).map((r) => ({
        id: Number(r.id),
        first_name: r.first_name,
        last_name: r.last_name,
        display_name: `${r.first_name || ''} ${r.last_name || ''}`.trim()
      })),
      clients: (cli || []).map((r) => ({
        id: Number(r.id),
        initials: r.initials,
        identifier_code: r.identifier_code
      }))
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/public/skill-builders/agency/:slug/kiosk/events/:eventId/identify */
export const identifySkillBuildersEventKioskStaff = async (req, res, next) => {
  try {
    const ctx = verifySkillBuildersEventKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const pin = normalizeStaffKioskPin(req.body?.pin);
    if (!pin) return res.status(400).json({ error: { message: 'PIN must be 4 digits' } });

    const pinHash = KioskModel.hashPin(pin);
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name
       FROM users u
       JOIN user_preferences up ON up.user_id = u.id AND up.kiosk_pin_hash = ?
       JOIN skills_group_providers sgp ON sgp.provider_user_id = u.id
       JOIN skills_groups sg ON sg.id = sgp.skills_group_id
       WHERE sg.company_event_id = ? AND sg.agency_id = ?
         AND u.status = 'active'`,
      [pinHash, m.eventId, m.agencyId]
    );

    if (!rows?.length) {
      return res.status(404).json({ error: { message: 'No provider on this event roster matches that PIN' } });
    }
    if (rows.length > 1) {
      return res.status(400).json({ error: { message: 'Multiple providers share this PIN. Tap your name instead.' } });
    }

    const user = rows[0];
    res.json({
      userId: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      display_name: `${user.first_name || ''} ${user.last_name || ''}`.trim()
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/public/skill-builders/agency/:slug/kiosk/events/:eventId/clock-in */
export const skillBuildersEventKioskPublicClockIn = async (req, res, next) => {
  try {
    const ctx = verifySkillBuildersEventKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const userId = parsePositiveInt(req.body?.userId);
    const sessionRaw = req.body?.sessionId;
    const clientRaw = req.body?.clientId;
    const sessionIdParsed = parseInt(sessionRaw, 10);
    const clientIdParsed = parseInt(clientRaw, 10);
    const sessionId = Number.isFinite(sessionIdParsed) && sessionIdParsed > 0 ? sessionIdParsed : null;
    const clientId = Number.isFinite(clientIdParsed) && clientIdParsed > 0 ? clientIdParsed : null;
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });

    const result = await recordSkillBuilderEventClockIn(pool, {
      agencyId: m.agencyId,
      eventId: m.eventId,
      userId,
      sessionId,
      clientId,
      officeLocationId: null
    });
    if (result.error) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }
    res.status(201).json({ ok: true, punchId: result.punchId });
  } catch (e) {
    next(e);
  }
};

/** POST /api/public/skill-builders/agency/:slug/kiosk/events/:eventId/clock-out */
export const skillBuildersEventKioskPublicClockOut = async (req, res, next) => {
  try {
    const ctx = verifySkillBuildersEventKioskBearer(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const userId = parsePositiveInt(req.body?.userId);
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });

    const result = await recordSkillBuilderEventClockOut(pool, {
      agencyId: m.agencyId,
      eventId: m.eventId,
      userId
    });
    if (result.error) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }
    res.status(201).json({
      ok: true,
      punchOutId: result.punchOutId,
      payrollTimeClaimId: result.payrollTimeClaimId,
      directHours: result.directHours,
      indirectHours: result.indirectHours,
      workedHours: result.workedHours
    });
  } catch (e) {
    next(e);
  }
};
