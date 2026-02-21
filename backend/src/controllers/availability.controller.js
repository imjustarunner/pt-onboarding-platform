import pool from '../config/database.js';
import User from '../models/User.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import { syncSchoolPortalDayProvider } from '../services/schoolPortalDaySync.service.js';
import ProviderVirtualWorkingHours from '../models/ProviderVirtualWorkingHours.model.js';
import PublicAppointmentRequest from '../models/PublicAppointmentRequest.model.js';
import ProviderAvailabilityService from '../services/providerAvailability.service.js';
import crypto from 'crypto';
import EmailService from '../services/email.service.js';
import Notification from '../models/Notification.model.js';
import { isPublicProviderFinderFeatureEnabled } from '../services/publicAvailabilityGate.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import OfficeScheduleMaterializer from '../services/officeScheduleMaterializer.service.js';

function parseIntSafe(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function toYmd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function startOfWeekMonday(dateLike) {
  const d = new Date(dateLike || Date.now());
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(dateLike, days) {
  const d = new Date(dateLike);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

async function resolveAgencyId(req) {
  const raw = req.query.agencyId ?? req.body?.agencyId ?? req.user?.agencyId ?? null;
  const agencyId = parseIntSafe(raw);
  if (agencyId) return agencyId;
  try {
    const agencies = await User.getAgencies(req.user.id);
    const first = agencies?.[0]?.id ? Number(agencies[0].id) : null;
    return first || null;
  } catch {
    return null;
  }
}

async function requireAgencyMembership(req, res, agencyId) {
  if (!agencyId) {
    res.status(400).json({ error: { message: 'agencyId is required' } });
    return false;
  }
  if (req.user?.role === 'super_admin') return true;
  const [rows] = await pool.execute(
    `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
    [req.user.id, agencyId]
  );
  if (!rows?.[0]) {
    res.status(403).json({ error: { message: 'Access denied' } });
    return false;
  }
  return true;
}

async function isUserSupervised({ providerId, agencyId }) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM supervisor_assignments
     WHERE supervisee_id = ? AND agency_id = ?
     LIMIT 1`,
    [providerId, agencyId]
  );
  return !!rows?.[0];
}

async function isSupervisorOfProvider({ supervisorId, providerId, agencyId }) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM supervisor_assignments
     WHERE supervisor_id = ? AND supervisee_id = ? AND agency_id = ?
     LIMIT 1`,
    [supervisorId, providerId, agencyId]
  );
  return !!rows?.[0];
}

const canManageAvailability = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'clinical_practice_assistant' || r === 'provider_plus' || r === 'staff';
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SET = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
const WEEKEND_SET = new Set(['Saturday', 'Sunday']);
const SKILL_BUILDER_MINUTES_PER_WEEK = 6 * 60;

function canViewAvailabilityDashboard(role) {
  const r = String(role || '').toLowerCase();
  return canManageAvailability(r) || r === 'schedule_manager' || r === 'supervisor';
}

function buildProviderFinderPublicUrl({ agencyId, key }) {
  const rawBase = String(
    process.env.FRONTEND_URL ||
    process.env.APP_BASE_URL ||
    process.env.CORS_ORIGIN ||
    'http://localhost:5173'
  ).trim();
  const base = rawBase.replace(/\/+$/, '');
  const qs = key ? `?key=${encodeURIComponent(String(key))}` : '';
  return `${base}/find-provider/${Number(agencyId)}${qs}`;
}

function mysqlDateTimeToIso(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const parsed = new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function dayNameFromDateLike(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[d.getUTCDay()] || null;
}

async function ensureClientProviderLinkedForRequest({ requestRow, actorUserId }) {
  const providerUserId = Number(requestRow?.provider_id || 0);
  const clientId = Number(requestRow?.created_client_id || requestRow?.matched_client_id || 0);
  if (!providerUserId || !clientId) return;

  const [clientRows] = await pool.execute(
    `SELECT id, organization_id
     FROM clients
     WHERE id = ?
     LIMIT 1`,
    [clientId]
  );
  const client = clientRows?.[0] || null;
  if (!client) return;

  const serviceDay = dayNameFromDateLike(mysqlDateTimeToIso(requestRow?.requested_start_at) || requestRow?.requested_start_at);
  await pool.execute(
    `UPDATE clients
     SET provider_id = ?,
         updated_by_user_id = ?,
         last_activity_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [providerUserId, actorUserId || null, clientId]
  );

  if (!Number(client.organization_id || 0)) return;
  try {
    await pool.execute(
      `UPDATE client_provider_assignments
       SET is_active = FALSE,
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE client_id = ?
         AND organization_id = ?
         AND provider_user_id <> ?`,
      [actorUserId || null, clientId, Number(client.organization_id), providerUserId]
    );

    await pool.execute(
      `INSERT INTO client_provider_assignments
        (client_id, organization_id, provider_user_id, service_day, is_active, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, TRUE, ?, ?)
       ON DUPLICATE KEY UPDATE
         service_day = VALUES(service_day),
         is_active = TRUE,
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [clientId, Number(client.organization_id), providerUserId, serviceDay || null, actorUserId || null, actorUserId || null]
    );
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }
}

async function requestStillAvailable({ agencyId, requestRow }) {
  const providerId = Number(requestRow?.provider_id || 0);
  if (!providerId) return false;
  const startIso = mysqlDateTimeToIso(requestRow?.requested_start_at);
  const endIso = mysqlDateTimeToIso(requestRow?.requested_end_at);
  if (!startIso || !endIso) return false;
  const weekStart = startOfWeekMonday(new Date(startIso)).toISOString().slice(0, 10);
  const intakeOnly = String(requestRow?.booking_mode || '').toUpperCase() !== 'CURRENT_CLIENT';
  const modality = String(requestRow?.modality || '').toUpperCase();
  const availability = await ProviderAvailabilityService.computeWeekAvailability({
    agencyId,
    providerId,
    weekStartYmd: weekStart,
    includeGoogleBusy: true,
    externalCalendarIds: [],
    slotMinutes: 60,
    intakeOnly
  });
  const list = modality === 'VIRTUAL' ? (availability.virtualSlots || []) : (availability.inPersonSlots || []);
  const wanted = `${startIso}|${endIso}`;
  return list.some((s) => `${s.startAt}|${s.endAt}` === wanted);
}

async function sendPublicRequestDecisionNotifications({ agencyId, requestRow, status, actorUserId }) {
  const st = String(status || '').toUpperCase();
  if (!['APPROVED', 'DECLINED', 'CANCELLED'].includes(st)) return;

  const providerId = Number(requestRow?.provider_id || 0);
  const [providerRows] = await pool.execute(
    `SELECT id, first_name, last_name, email
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [providerId]
  );
  const provider = providerRows?.[0] || null;
  const [agencyRows] = await pool.execute(
    `SELECT id, name
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [agencyId]
  );
  const agencyName = String(agencyRows?.[0]?.name || `Agency ${agencyId}`);
  const clientName = String(requestRow?.client_name || 'Client').trim();
  const start = mysqlDateTimeToIso(requestRow?.requested_start_at) || requestRow?.requested_start_at;
  const end = mysqlDateTimeToIso(requestRow?.requested_end_at) || requestRow?.requested_end_at;
  const timeLabel = start && end ? `${new Date(start).toLocaleString()} - ${new Date(end).toLocaleTimeString()}` : 'requested time';
  const modality = String(requestRow?.modality || '').toUpperCase() === 'VIRTUAL' ? 'Virtual' : 'In-Person';
  const statusLabel = st === 'APPROVED' ? 'approved' : st === 'DECLINED' ? 'declined' : 'cancelled';

  try {
    await Notification.create({
      type: 'program_reminder',
      severity: st === 'APPROVED' ? 'info' : 'warning',
      title: `Public appointment request ${statusLabel}`,
      message: `${clientName} (${modality}) for ${timeLabel} has been ${statusLabel}.`,
      userId: provider?.id || null,
      agencyId: Number(agencyId),
      relatedEntityType: 'public_appointment_request',
      relatedEntityId: Number(requestRow?.id || 0) || null,
      ...(actorUserId ? { actorUserId } : { actorSource: 'System' })
    });
  } catch {
    // non-blocking
  }

  if (!EmailService.isConfigured()) return;
  const providerName = `${provider?.first_name || ''} ${provider?.last_name || ''}`.trim() || `Provider #${providerId}`;
  const subject = `Public appointment request ${statusLabel} - ${agencyName}`;
  const text = [
    `Provider: ${providerName}`,
    `Client: ${clientName}`,
    `Modality: ${modality}`,
    `Time: ${timeLabel}`,
    `Status: ${st}`,
    '',
    `Agency: ${agencyName}`
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <p><strong>Provider:</strong> ${providerName}</p>
      <p><strong>Client:</strong> ${clientName}</p>
      <p><strong>Modality:</strong> ${modality}</p>
      <p><strong>Time:</strong> ${timeLabel}</p>
      <p><strong>Status:</strong> ${st}</p>
      <p><strong>Agency:</strong> ${agencyName}</p>
    </div>
  `.trim();

  const recipients = [String(requestRow?.client_email || '').trim(), String(provider?.email || '').trim()]
    .filter(Boolean);
  for (const to of recipients) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await EmailService.sendEmail({
        to,
        subject,
        text,
        html,
        fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
        fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
        replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
        source: 'auto',
        agencyId: Number(agencyId),
        actorUserId: actorUserId || null
      });
    } catch {
      // best-effort
    }
  }
}

function weekdayIntFromDayName(dayName) {
  const d = normalizeDayName(dayName);
  if (!d) return null;
  const idx = DAY_NAMES.indexOf(d);
  return idx >= 0 ? idx : null;
}

function dayNameFromWeekdayInt(weekday) {
  const n = Number(weekday);
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  return DAY_NAMES[n] || null;
}

function minutesBetween(startHHMMSS, endHHMMSS) {
  const s = String(startHHMMSS || '');
  const e = String(endHHMMSS || '');
  const m1 = s.match(/^(\d{2}):(\d{2}):\d{2}$/);
  const m2 = e.match(/^(\d{2}):(\d{2}):\d{2}$/);
  if (!m1 || !m2) return 0;
  const a = Number(m1[1]) * 60 + Number(m1[2]);
  const b = Number(m2[1]) * 60 + Number(m2[2]);
  return b > a ? b - a : 0;
}

async function getSkillBuilderEligibility(providerId) {
  try {
    const [rows] = await pool.execute(`SELECT skill_builder_eligible FROM users WHERE id = ? LIMIT 1`, [providerId]);
    const v = rows?.[0]?.skill_builder_eligible;
    return v === true || v === 1 || v === '1';
  } catch (e) {
    // Migration may not be applied yet.
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function getSkillBuilderCoordinatorAccess(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT has_skill_builder_coordinator_access FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const v = rows?.[0]?.has_skill_builder_coordinator_access;
    return v === true || v === 1 || v === '1';
  } catch (e) {
    // Migration may not be applied yet.
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

function normalizeDayName(d) {
  const s = String(d || '').trim();
  const canonical = DAY_NAMES.find((x) => x.toLowerCase() === s.toLowerCase());
  return canonical || null;
}

function normalizeBlockType(t) {
  const s = String(t || '').trim().toUpperCase();
  if (s === 'AFTER_SCHOOL') return 'AFTER_SCHOOL';
  if (s === 'WEEKEND') return 'WEEKEND';
  if (s === 'CUSTOM') return 'CUSTOM';
  return null;
}

function normalizeTimeHHMM(v) {
  const s = String(v || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map((x) => parseInt(x, 10));
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export const getMyAvailabilityPending = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const providerId = req.user.id;

    const [officeReqRows] = await pool.execute(
      `SELECT *
       FROM provider_office_availability_requests
       WHERE agency_id = ? AND provider_id = ? AND status = 'PENDING'
       ORDER BY created_at DESC`,
      [agencyId, providerId]
    );
    const officeReqs = [];
    for (const r of officeReqRows || []) {
      const [slotRows] = await pool.execute(
        `SELECT weekday, start_hour, end_hour
         FROM provider_office_availability_request_slots
         WHERE request_id = ?
         ORDER BY weekday ASC, start_hour ASC`,
        [r.id]
      );
      officeReqs.push({
        id: r.id,
        preferredOfficeIds: r.preferred_office_ids_json ? JSON.parse(r.preferred_office_ids_json) : [],
        notes: r.notes || '',
        createdAt: r.created_at,
        slots: (slotRows || []).map((s) => ({ weekday: s.weekday, startHour: s.start_hour, endHour: s.end_hour }))
      });
    }

    const [schoolReqRows] = await pool.execute(
      `SELECT *
       FROM provider_school_availability_requests
       WHERE agency_id = ? AND provider_id = ? AND status = 'PENDING'
       ORDER BY created_at DESC`,
      [agencyId, providerId]
    );
    const schoolReqs = [];
    for (const r of schoolReqRows || []) {
      const [blockRows] = await pool.execute(
        `SELECT day_of_week, block_type, start_time, end_time
         FROM provider_school_availability_request_blocks
         WHERE request_id = ?
         ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
        [r.id]
      );
      schoolReqs.push({
        id: r.id,
        preferredSchoolOrgIds: r.preferred_school_org_ids_json ? JSON.parse(r.preferred_school_org_ids_json) : [],
        notes: r.notes || '',
        createdAt: r.created_at,
        blocks: (blockRows || []).map((b) => ({
          dayOfWeek: b.day_of_week,
          blockType: b.block_type,
          startTime: String(b.start_time || '').slice(0, 5),
          endTime: String(b.end_time || '').slice(0, 5)
        }))
      });
    }

    const cycleStart = startOfWeekMonday(new Date());
    const cycleEnd = addDays(cycleStart, 13);
    const week1Start = toYmd(cycleStart);
    const week2Start = toYmd(addDays(cycleStart, 7));

    // Skill Builder weekly availability (recurring blocks + weekly confirmation)
    const skillBuilderEligible = await getSkillBuilderEligibility(providerId);
    let skillBuilder = {
      eligible: skillBuilderEligible,
      requiredHoursPerWeek: 6,
      totalHoursPerWeek: 0,
      confirmations: [], // [{ weekStartDate, confirmedAt }]
      needsConfirmation: false, // true when any of the next-two-weeks confirmations are missing
      blocks: []
    };
    if (skillBuilderEligible) {
      try {
        const [blockRows] = await pool.execute(
          `SELECT day_of_week, block_type, start_time, end_time, depart_from, depart_time, is_booked
           FROM provider_skill_builder_availability
           WHERE agency_id = ? AND provider_id = ?
           ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
          [agencyId, providerId]
        );
        const blocks = (blockRows || []).map((b) => ({
          dayOfWeek: b.day_of_week,
          blockType: b.block_type,
          startTime: String(b.start_time || '').slice(0, 5),
          endTime: String(b.end_time || '').slice(0, 5),
          departFrom: String(b.depart_from || '').trim(),
          departTime: b.depart_time ? String(b.depart_time).slice(0, 5) : '',
          isBooked: b.is_booked === true || b.is_booked === 1 || b.is_booked === '1'
        }));
        // Compute hours/week
        let totalMinutes = 0;
        for (const b of blockRows || []) {
          const t = String(b.block_type || '').toUpperCase();
          if (t === 'AFTER_SCHOOL') totalMinutes += 90;
          else if (t === 'WEEKEND') totalMinutes += 180;
          else totalMinutes += minutesBetween(String(b.start_time || ''), String(b.end_time || ''));
        }
        const [confRows] = await pool.execute(
          `SELECT week_start_date, confirmed_at
           FROM provider_skill_builder_availability_confirmations
           WHERE agency_id = ? AND provider_id = ? AND week_start_date IN (?, ?)
           ORDER BY week_start_date ASC`,
          [agencyId, providerId, week1Start, week2Start]
        );
        const byWeek = new Map();
        for (const r of confRows || []) {
          const wk = String(r.week_start_date || '').slice(0, 10);
          byWeek.set(wk, r.confirmed_at || null);
        }
        const confirmations = [
          { weekStartDate: week1Start, confirmedAt: byWeek.get(week1Start) || null },
          { weekStartDate: week2Start, confirmedAt: byWeek.get(week2Start) || null }
        ];
        skillBuilder = {
          eligible: true,
          requiredHoursPerWeek: 6,
          totalHoursPerWeek: Math.round((totalMinutes / 60) * 100) / 100,
          confirmations,
          needsConfirmation: confirmations.some((c) => !c.confirmedAt),
          blocks
        };
      } catch (e) {
        if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
          // tables not migrated yet
        } else {
          throw e;
        }
      }
    }

    res.json({
      ok: true,
      agencyId,
      officeRequests: officeReqs,
      schoolRequests: schoolReqs,
      skillBuilder,
      cycle: {
        // For biweekly confirmation UX (current + next week)
        cycleStartDate: week1Start,
        cycleEndDate: toYmd(cycleEnd),
        weekStartDates: [week1Start, week2Start]
      }
    });
  } catch (e) {
    next(e);
  }
};

export const getMyVirtualWorkingHours = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const providerId = Number(req.user?.id || 0);
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid user' } });

    const rows = await ProviderVirtualWorkingHours.listForProvider({ agencyId, providerId });
    res.json({ ok: true, agencyId, providerId, rows });
  } catch (e) {
    next(e);
  }
};

export const putMyVirtualWorkingHours = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const providerId = Number(req.user?.id || 0);
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid user' } });

    const rows = Array.isArray(req.body?.rows)
      ? req.body.rows
      : (Array.isArray(req.body?.virtualWorkingHours) ? req.body.virtualWorkingHours : []);
    if (!Array.isArray(rows)) return res.status(400).json({ error: { message: 'rows must be an array' } });
    if (rows.length > 100) return res.status(400).json({ error: { message: 'Too many rows' } });

    const normalized = ProviderVirtualWorkingHours.normalizeRows(rows);

    // Validate overlaps within each day
    const byDay = new Map();
    for (const r of normalized) {
      if (!byDay.has(r.dayOfWeek)) byDay.set(r.dayOfWeek, []);
      byDay.get(r.dayOfWeek).push(r);
    }
    for (const [day, list] of byDay.entries()) {
      list.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
      for (let i = 1; i < list.length; i++) {
        if (String(list[i].startTime) < String(list[i - 1].endTime)) {
          return res.status(400).json({ error: { message: `Overlapping virtual working hours on ${day}` } });
        }
      }
    }

    const saved = await ProviderVirtualWorkingHours.replaceForProvider({ agencyId, providerId, rows: normalized });
    res.json({ ok: true, agencyId, providerId, rows: saved });
  } catch (e) {
    next(e);
  }
};

export const getProviderWeekAvailability = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;

    const providerId = parseIntSafe(req.params.providerId);
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid providerId' } });

    const role = String(req.user?.role || '').toLowerCase();
    const intakeLab = String(req.query.intakeLab || 'false').toLowerCase() === 'true';
    const requestUserId = Number(req.user?.id || 0);
    const isSelf = requestUserId === Number(providerId);
    let canViewProvider = isSelf || canManageAvailability(role);
    if (!canViewProvider && role === 'supervisor' && intakeLab) {
      canViewProvider = true;
    } else if (!canViewProvider && role === 'supervisor') {
      canViewProvider = await isSupervisorOfProvider({ supervisorId: requestUserId, providerId, agencyId });
    }
    if (!canViewProvider) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const weekStartYmd = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const includeGoogleBusy = String(req.query.includeGoogleBusy || 'true').toLowerCase() === 'true';
    const slotMinutes = parseIntSafe(req.query.slotMinutes) || 60;
    const intakeOnly =
      String(req.query.sessionType || '').trim().toUpperCase() === 'INTAKE' ||
      String(req.query.intakeOnly || '').trim().toLowerCase() === 'true';
    const externalCalendarIds = String(req.query.externalCalendarIds || '')
      .split(',')
      .map((x) => parseIntSafe(x))
      .filter((n) => Number.isInteger(n) && n > 0);

    const r = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId,
      providerId,
      weekStartYmd,
      includeGoogleBusy,
      externalCalendarIds,
      slotMinutes,
      intakeOnly
    });

    res.json({
      ok: true,
      agencyId: r.agencyId,
      providerId: r.providerId,
      weekStart: r.weekStart,
      weekEnd: r.weekEnd,
      timeZone: r.timeZone,
      slotMinutes: r.slotMinutes,
      virtualSlots: r.virtualSlots || [],
      inPersonSlots: r.inPersonSlots || []
    });
  } catch (e) {
    next(e);
  }
};

export const createMyOfficeAvailabilityRequest = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const providerId = req.user.id;

    const preferredOfficeIds = Array.isArray(req.body?.preferredOfficeIds) ? req.body.preferredOfficeIds : [];
    const officeIds = preferredOfficeIds.map((n) => parseIntSafe(n)).filter((n) => Number.isInteger(n) && n > 0);
    const notes = String(req.body?.notes || '').trim().slice(0, 2000);
    const slots = Array.isArray(req.body?.slots) ? req.body.slots : [];

    // Validate office IDs are accessible to this agency (multi-agency office support)
    if (officeIds.length > 0) {
      const allowedOfficeIds = await OfficeLocationAgency.listOfficeIdsForAgencies([agencyId]);
      const allowedSet = new Set((allowedOfficeIds || []).map((x) => Number(x)));
      const bad = officeIds.filter((id) => !allowedSet.has(Number(id)));
      if (bad.length) return res.status(400).json({ error: { message: 'One or more selected offices are not available for this agency.' } });
    }

    const normalizedSlots = [];
    for (const s of slots) {
      const weekday = parseIntSafe(s?.weekday);
      const startHour = parseIntSafe(s?.startHour);
      const endHour = parseIntSafe(s?.endHour);
      if (!(weekday >= 0 && weekday <= 6)) continue;
      if (!(startHour >= 0 && startHour <= 23)) continue;
      if (!(endHour >= 1 && endHour <= 24)) continue;
      if (!(endHour > startHour)) continue;
      normalizedSlots.push({ weekday, startHour, endHour });
    }
    if (normalizedSlots.length === 0) {
      return res.status(400).json({ error: { message: 'At least one day/time slot is required.' } });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO provider_office_availability_requests
        (agency_id, provider_id, preferred_office_ids_json, notes, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      [agencyId, providerId, officeIds.length ? JSON.stringify(officeIds) : null, notes || null]
    );
    const requestId = result.insertId;

    for (const s of normalizedSlots) {
      await conn.execute(
        `INSERT INTO provider_office_availability_request_slots
          (request_id, weekday, start_hour, end_hour)
         VALUES (?, ?, ?, ?)`,
        [requestId, s.weekday, s.startHour, s.endHour]
      );
    }

    await conn.commit();

    // Notify admin/CPA/provider_plus/staff who can approve
    try {
      const [userRows] = await pool.execute(
        `SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`,
        [providerId]
      );
      const providerName = userRows?.[0]
        ? `${userRows[0].first_name || ''} ${userRows[0].last_name || ''}`.trim() || `Provider #${providerId}`
        : `Provider #${providerId}`;
      await Notification.create({
        type: 'office_availability_request_pending',
        severity: 'info',
        title: 'Office request pending',
        message: `${providerName} requested office availability. Assign or deny in Availability Intake.`,
        audienceJson: { admin: true, clinicalPracticeAssistant: true, schoolStaff: false },
        userId: null,
        agencyId,
        relatedEntityType: 'provider_office_availability_request',
        relatedEntityId: requestId,
        actorUserId: providerId
      });
    } catch {
      /* non-blocking */
    }

    res.status(201).json({ ok: true, id: requestId });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

export const createMySchoolAvailabilityRequest = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const providerId = req.user.id;

    // Daytime school availability does not allow selecting a school.
    const schoolOrgIds = [];
    const notes = String(req.body?.notes || '').trim().slice(0, 2000);
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];

    const [existing] = await pool.execute(
      `SELECT id FROM provider_school_availability_requests
       WHERE agency_id = ? AND provider_id = ? AND status = 'PENDING'
       LIMIT 1`,
      [agencyId, providerId]
    );
    if (existing?.[0]?.id) {
      return res.status(409).json({ error: { message: 'You already have a pending school availability request.' } });
    }

    const normalizedBlocks = [];
    for (const b of blocks) {
      const dayOfWeek = normalizeDayName(b?.dayOfWeek);
      if (!dayOfWeek) continue;
      if (!WEEKDAY_SET.has(dayOfWeek)) continue; // school daytime is weekday-only
      const startTime = normalizeTimeHHMM(b?.startTime);
      const endTime = normalizeTimeHHMM(b?.endTime);
      if (!startTime || !endTime) continue;
      if (endTime <= startTime) continue;
      // Soft guard to keep this "daytime" (allow 06:00–18:00)
      if (startTime < '06:00:00') continue;
      if (endTime > '18:00:00') continue;
      normalizedBlocks.push({ dayOfWeek, blockType: 'CUSTOM', startTime, endTime });
    }
    if (normalizedBlocks.length === 0) {
      return res.status(400).json({ error: { message: 'At least one weekday daytime block is required (06:00–18:00).' } });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO provider_school_availability_requests
        (agency_id, provider_id, preferred_school_org_ids_json, notes, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      [agencyId, providerId, null, notes || null]
    );
    const requestId = result.insertId;

    for (const b of normalizedBlocks) {
      await conn.execute(
        `INSERT INTO provider_school_availability_request_blocks
          (request_id, day_of_week, block_type, start_time, end_time)
         VALUES (?, ?, ?, ?, ?)`,
        [requestId, b.dayOfWeek, b.blockType, b.startTime, b.endTime]
      );
    }

    await conn.commit();
    res.status(201).json({ ok: true, id: requestId });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

export const confirmMySupervisedAvailability = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const providerId = req.user.id;

    const supervised = await isUserSupervised({ providerId, agencyId });
    if (!supervised) return res.status(403).json({ error: { message: 'Supervised availability confirmation is not required for your account.' } });

    const cycleStart = startOfWeekMonday(new Date());
    const week1Start = toYmd(cycleStart);
    const week2Start = toYmd(addDays(cycleStart, 7));
    const cycleEnd = toYmd(addDays(cycleStart, 13));

    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const normalized = [];
    for (const b of blocks) {
      const weekStartDate = String(b?.weekStartDate || '').slice(0, 10);
      if (![week1Start, week2Start].includes(weekStartDate)) continue;
      const dayOfWeek = normalizeDayName(b?.dayOfWeek);
      const blockType = normalizeBlockType(b?.blockType);
      if (!dayOfWeek || !blockType) continue;
      if (blockType === 'AFTER_SCHOOL') {
        if (!WEEKDAY_SET.has(dayOfWeek)) continue;
        normalized.push({ weekStartDate, dayOfWeek, blockType: 'AFTER_SCHOOL', startTime: '14:30:00', endTime: '17:00:00' });
      } else if (blockType === 'WEEKEND') {
        if (!WEEKEND_SET.has(dayOfWeek)) continue;
        normalized.push({ weekStartDate, dayOfWeek, blockType: 'WEEKEND', startTime: '11:30:00', endTime: '15:30:00' });
      }
    }

    // Validate per-week minimum rule
    const byWeek = new Map();
    for (const b of normalized) {
      if (!byWeek.has(b.weekStartDate)) byWeek.set(b.weekStartDate, []);
      byWeek.get(b.weekStartDate).push(b);
    }
    for (const wk of [week1Start, week2Start]) {
      const arr = byWeek.get(wk) || [];
      const count = arr.length;
      const hasWeekend = arr.some((x) => WEEKEND_SET.has(x.dayOfWeek));
      const ok = count >= 4 || (count >= 3 && hasWeekend);
      if (!ok) {
        return res.status(400).json({
          error: { message: `Week starting ${wk} must have either 3 blocks including a weekend day, or 4 blocks.` }
        });
      }
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Upsert confirmation
    const [existing] = await conn.execute(
      `SELECT id
       FROM supervised_availability_confirmations
       WHERE agency_id = ? AND provider_id = ? AND cycle_start_date = ?
       LIMIT 1`,
      [agencyId, providerId, week1Start]
    );
    let confirmationId = existing?.[0]?.id || null;
    if (!confirmationId) {
      const [ins] = await conn.execute(
        `INSERT INTO supervised_availability_confirmations
          (agency_id, provider_id, cycle_start_date, cycle_end_date, confirmed_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [agencyId, providerId, week1Start, cycleEnd]
      );
      confirmationId = ins.insertId;
    } else {
      await conn.execute(
        `UPDATE supervised_availability_confirmations
         SET cycle_end_date = ?, confirmed_at = NOW()
         WHERE id = ?`,
        [cycleEnd, confirmationId]
      );
      await conn.execute(`DELETE FROM supervised_availability_blocks WHERE confirmation_id = ?`, [confirmationId]);
    }

    for (const b of normalized) {
      await conn.execute(
        `INSERT INTO supervised_availability_blocks
          (confirmation_id, week_start_date, day_of_week, block_type, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [confirmationId, b.weekStartDate, b.dayOfWeek, b.blockType, b.startTime, b.endTime]
      );
    }

    await conn.commit();
    res.json({ ok: true, confirmationId, cycleStartDate: week1Start, cycleEndDate: cycleEnd });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

function normalizeSkillBuilderBlocks(blocks) {
  const normalized = [];
  for (const b of blocks || []) {
    const dayOfWeek = normalizeDayName(b?.dayOfWeek);
    const blockType = normalizeBlockType(b?.blockType);
    if (!dayOfWeek || !blockType) continue;

    const departFrom = String(b?.departFrom || '').trim().slice(0, 255);
    if (!departFrom) continue;
    const departTime = b?.departTime ? normalizeTimeHHMM(b.departTime) : null;
    const isBooked =
      b?.isBooked === true ||
      b?.isBooked === 1 ||
      b?.isBooked === '1' ||
      String(b?.isBooked || '').toLowerCase() === 'true';

    if (blockType === 'AFTER_SCHOOL') {
      if (!WEEKDAY_SET.has(dayOfWeek)) continue;
      normalized.push({
        dayOfWeek,
        blockType,
        startTime: '15:00:00',
        endTime: '16:30:00',
        departFrom,
        departTime,
        isBooked
      });
    } else if (blockType === 'WEEKEND') {
      if (!WEEKEND_SET.has(dayOfWeek)) continue;
      normalized.push({
        dayOfWeek,
        blockType,
        startTime: '12:00:00',
        endTime: '15:00:00',
        departFrom,
        departTime,
        isBooked
      });
    } else {
      const startTime = normalizeTimeHHMM(b?.startTime);
      const endTime = normalizeTimeHHMM(b?.endTime);
      if (!startTime || !endTime) continue;
      if (endTime <= startTime) continue;
      normalized.push({ dayOfWeek, blockType, startTime, endTime, departFrom, departTime, isBooked });
    }
  }
  return normalized;
}

function totalMinutesForSkillBuilderBlocks(blocks) {
  let total = 0;
  for (const b of blocks || []) {
    const t = String(b?.blockType || '').toUpperCase();
    if (t === 'AFTER_SCHOOL') total += 90;
    else if (t === 'WEEKEND') total += 180;
    else total += minutesBetween(b?.startTime, b?.endTime);
  }
  return total;
}

export const submitMySkillBuilderAvailability = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const providerId = req.user.id;

    const eligible = await getSkillBuilderEligibility(providerId);
    if (!eligible) {
      return res.status(403).json({ error: { message: 'Skill Builder availability is not enabled for your account.' } });
    }

    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const normalizedBlocks = normalizeSkillBuilderBlocks(blocks);
    if (normalizedBlocks.length === 0) {
      return res.status(400).json({ error: { message: 'At least one availability block is required.' } });
    }

    const totalMinutes = totalMinutesForSkillBuilderBlocks(normalizedBlocks);
    if (totalMinutes < SKILL_BUILDER_MINUTES_PER_WEEK) {
      return res.status(400).json({ error: { message: 'Skill Builder availability must total at least 6 hours per week.' } });
    }

    const cycleStart = startOfWeekMonday(new Date());
    const weekStart = toYmd(cycleStart);
    const nextWeekStart = toYmd(addDays(cycleStart, 7));

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Replace recurring availability blocks
    await conn.execute(
      `DELETE FROM provider_skill_builder_availability WHERE agency_id = ? AND provider_id = ?`,
      [agencyId, providerId]
    );
    for (const b of normalizedBlocks) {
      await conn.execute(
        `INSERT INTO provider_skill_builder_availability
          (agency_id, provider_id, depart_from, depart_time, is_booked, day_of_week, block_type, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [agencyId, providerId, b.departFrom, b.departTime || null, b.isBooked ? 1 : 0, b.dayOfWeek, b.blockType, b.startTime, b.endTime]
      );
    }

    // Biweekly confirmation: confirm current week + next week (providers are prompted every 2 weeks).
    for (const wk of [weekStart, nextWeekStart]) {
      // eslint-disable-next-line no-await-in-loop
      await conn.execute(
        `INSERT INTO provider_skill_builder_availability_confirmations
          (agency_id, provider_id, week_start_date, confirmed_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE confirmed_at = VALUES(confirmed_at)`,
        [agencyId, providerId, wk]
      );
    }

    await conn.commit();
    res.json({
      ok: true,
      weekStartDates: [weekStart, nextWeekStart],
      totalHoursPerWeek: Math.round((totalMinutes / 60) * 100) / 100
    });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

export const confirmMySkillBuilderAvailability = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const providerId = req.user.id;

    const eligible = await getSkillBuilderEligibility(providerId);
    if (!eligible) {
      return res.status(403).json({ error: { message: 'Skill Builder availability is not enabled for your account.' } });
    }

    // Confirm requires existing saved availability meeting the minimum.
    let rows = [];
    try {
      const [blockRows] = await pool.execute(
        `SELECT block_type, start_time, end_time
         FROM provider_skill_builder_availability
         WHERE agency_id = ? AND provider_id = ?`,
        [agencyId, providerId]
      );
      rows = blockRows || [];
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(400).json({ error: { message: 'Skill Builder availability tables are not available yet. Run migrations.' } });
      }
      throw e;
    }

    let totalMinutes = 0;
    for (const b of rows) {
      const t = String(b.block_type || '').toUpperCase();
      if (t === 'AFTER_SCHOOL') totalMinutes += 90;
      else if (t === 'WEEKEND') totalMinutes += 180;
      else totalMinutes += minutesBetween(String(b.start_time || ''), String(b.end_time || ''));
    }

    if (totalMinutes < SKILL_BUILDER_MINUTES_PER_WEEK) {
      return res.status(400).json({ error: { message: 'Your saved Skill Builder availability is under 6 hours/week. Please update and submit your availability.' } });
    }

    const cycleStart = startOfWeekMonday(new Date());
    const weekStart = toYmd(cycleStart);
    const nextWeekStart = toYmd(addDays(cycleStart, 7));
    const requested = Array.isArray(req.body?.weekStartDates) ? req.body.weekStartDates : null;
    const allowed = new Set([weekStart, nextWeekStart]);
    const weekStartDates = requested
      ? [...new Set(requested.map((x) => String(x || '').slice(0, 10)).filter((x) => allowed.has(x)))]
      : [weekStart, nextWeekStart];
    if (weekStartDates.length === 0) {
      return res.status(400).json({ error: { message: 'weekStartDates must include the current and/or next week start date' } });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();
    for (const wk of weekStartDates) {
      // eslint-disable-next-line no-await-in-loop
      await conn.execute(
        `INSERT INTO provider_skill_builder_availability_confirmations
          (agency_id, provider_id, week_start_date, confirmed_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE confirmed_at = VALUES(confirmed_at)`,
        [agencyId, providerId, wk]
      );
    }

    // Clear forced-confirm flag (confirm-only requirement).
    try {
      await conn.execute(
        `UPDATE users SET skill_builder_confirm_required_next_login = 0 WHERE id = ?`,
        [providerId]
      );
    } catch (e) {
      // Migration may not be applied yet; don't block confirmation.
      if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    await conn.commit();

    res.json({ ok: true, weekStartDates, totalHoursPerWeek: Math.round((totalMinutes / 60) * 100) / 100 });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

export const listSkillBuildersAvailability = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const allowed =
      canManageAvailability(req.user?.role) || (await getSkillBuilderCoordinatorAccess(req.user?.id));
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    // Week start (Monday) for confirmation lookup; defaults to current week.
    const ws = String(req.query.weekStart || '').trim();
    const weekStart = ws && /^\d{4}-\d{2}-\d{2}$/.test(ws) ? ws : toYmd(startOfWeekMonday(new Date()));

    const [providerRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email,
              c.confirmed_at
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       LEFT JOIN provider_skill_builder_availability_confirmations c
         ON c.agency_id = ua.agency_id AND c.provider_id = u.id AND c.week_start_date = ?
       WHERE u.skill_builder_eligible = TRUE
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND (u.is_active = TRUE OR u.is_active IS NULL)
         AND (u.status IS NULL OR UPPER(u.status) <> 'ARCHIVED')
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [agencyId, weekStart]
    );
    const providers = (providerRows || []).map((r) => ({
      id: Number(r.id),
      firstName: r.first_name || '',
      lastName: r.last_name || '',
      email: r.email || '',
      confirmedAt: r.confirmed_at || null,
      blocks: []
    }));

    const ids = providers.map((p) => Number(p.id)).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return res.json({ ok: true, agencyId, weekStart, providers: [] });

    const placeholders = ids.map(() => '?').join(',');
    const [blockRows] = await pool.execute(
      `SELECT provider_id, day_of_week, block_type, start_time, end_time, depart_from, depart_time, is_booked
       FROM provider_skill_builder_availability
       WHERE agency_id = ?
         AND provider_id IN (${placeholders})
       ORDER BY provider_id ASC,
                FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'),
                start_time ASC`,
      [agencyId, ...ids]
    );

    const byId = new Map(providers.map((p) => [Number(p.id), p]));
    for (const b of blockRows || []) {
      const p = byId.get(Number(b.provider_id));
      if (!p) continue;
      p.blocks.push({
        dayOfWeek: b.day_of_week,
        blockType: b.block_type,
        startTime: String(b.start_time || '').slice(0, 5),
        endTime: String(b.end_time || '').slice(0, 5),
        departFrom: String(b.depart_from || '').trim(),
        departTime: b.depart_time ? String(b.depart_time).slice(0, 5) : '',
        isBooked: b.is_booked === true || b.is_booked === 1 || b.is_booked === '1'
      });
    }

    res.json({ ok: true, agencyId, weekStart, providers });
  } catch (e) {
    next(e);
  }
};

export const listOfficeAvailabilityRequests = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const status = String(req.query.status || 'PENDING').toUpperCase();
    const allowedStatus = new Set(['PENDING', 'ASSIGNED', 'CANCELLED']);
    const st = allowedStatus.has(status) ? status : 'PENDING';

    const [rows] = await pool.execute(
      `SELECT r.*,
              u.first_name AS provider_first_name,
              u.last_name AS provider_last_name
       FROM provider_office_availability_requests r
       JOIN users u ON u.id = r.provider_id
       WHERE r.agency_id = ?
         AND r.status = ?
       ORDER BY r.created_at DESC
       LIMIT 500`,
      [agencyId, st]
    );

    const out = [];
    for (const r of rows || []) {
      const [slotRows] = await pool.execute(
        `SELECT weekday, start_hour, end_hour
         FROM provider_office_availability_request_slots
         WHERE request_id = ?
         ORDER BY weekday ASC, start_hour ASC`,
        [r.id]
      );
      out.push({
        id: r.id,
        agencyId: r.agency_id,
        providerId: r.provider_id,
        providerName: `${r.provider_first_name || ''} ${r.provider_last_name || ''}`.trim(),
        preferredOfficeIds: r.preferred_office_ids_json ? JSON.parse(r.preferred_office_ids_json) : [],
        notes: r.notes || '',
        status: r.status,
        createdAt: r.created_at,
        slots: (slotRows || []).map((s) => ({ weekday: s.weekday, startHour: s.start_hour, endHour: s.end_hour }))
      });
    }

    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const assignTemporaryOfficeFromRequest = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const requestId = parseIntSafe(req.params.id);
    const officeId = parseIntSafe(req.body?.officeId);
    const roomId = parseIntSafe(req.body?.roomId);
    const weekday = parseIntSafe(req.body?.weekday);
    const hour = parseIntSafe(req.body?.hour);
    const weeks = parseIntSafe(req.body?.weeks) || 4;
    const freq = String(req.body?.assignedFrequency || 'WEEKLY').toUpperCase();
    if (!requestId || !officeId || !roomId || weekday === null || hour === null) {
      return res.status(400).json({ error: { message: 'requestId, officeId, roomId, weekday, and hour are required' } });
    }
    if (!(weekday >= 0 && weekday <= 6)) return res.status(400).json({ error: { message: 'weekday must be 0..6' } });
    if (!(hour >= 0 && hour <= 23)) return res.status(400).json({ error: { message: 'hour must be 0..23' } });
    if (!['WEEKLY', 'BIWEEKLY'].includes(freq)) return res.status(400).json({ error: { message: 'assignedFrequency must be WEEKLY or BIWEEKLY' } });

    // Ensure office belongs to agency (multi-agency office support)
    const okOffice = await OfficeLocationAgency.userHasAccess({ officeLocationId: officeId, agencyIds: [agencyId] });
    if (!okOffice) return res.status(400).json({ error: { message: 'Office is not available for this agency' } });

    // Ensure room belongs to office
    const [roomRows] = await pool.execute(`SELECT id FROM office_rooms WHERE id = ? AND office_location_id = ? LIMIT 1`, [roomId, officeId]);
    if (!roomRows?.[0]) return res.status(400).json({ error: { message: 'Room does not belong to the selected office' } });

    const [reqRows] = await pool.execute(
      `SELECT *
       FROM provider_office_availability_requests
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [requestId, agencyId]
    );
    const reqRow = reqRows?.[0] || null;
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });
    if (String(reqRow.status || '').toUpperCase() !== 'PENDING') {
      return res.status(409).json({ error: { message: 'Request is not pending' } });
    }

    // Enforce chosen time is within a submitted slot window
    const [slotRows] = await pool.execute(
      `SELECT 1
       FROM provider_office_availability_request_slots
       WHERE request_id = ?
         AND weekday = ?
         AND start_hour <= ?
         AND end_hour > ?
       LIMIT 1`,
      [requestId, weekday, hour, hour]
    );
    if (!slotRows?.[0]) return res.status(400).json({ error: { message: 'Selected day/hour is not within the submitted availability window' } });

    const providerId = Number(reqRow.provider_id);

    const until = new Date();
    until.setDate(until.getDate() + Math.max(1, weeks) * 7);
    const untilDate = toYmd(until);

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Find existing assignment (even if inactive), due to unique key constraints
    const [existingAssign] = await conn.execute(
      `SELECT id
       FROM office_standing_assignments
       WHERE room_id = ? AND provider_id = ? AND weekday = ? AND hour = ? AND assigned_frequency = ?
       LIMIT 1`,
      [roomId, providerId, weekday, hour, freq]
    );
    let assignmentId = existingAssign?.[0]?.id || null;
    if (!assignmentId) {
      const [ins] = await conn.execute(
        `INSERT INTO office_standing_assignments
          (office_location_id, room_id, provider_id, weekday, hour, assigned_frequency,
           availability_mode, temporary_until_date, last_two_week_confirmed_at, is_active, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, 'TEMPORARY', ?, NOW(), TRUE, ?)`,
        [officeId, roomId, providerId, weekday, hour, freq, untilDate, req.user.id]
      );
      assignmentId = ins.insertId;
    } else {
      await conn.execute(
        `UPDATE office_standing_assignments
         SET office_location_id = ?,
             availability_mode = 'TEMPORARY',
             temporary_until_date = ?,
             last_two_week_confirmed_at = NOW(),
             is_active = TRUE,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [officeId, untilDate, assignmentId]
      );
    }

    await conn.execute(
      `UPDATE provider_office_availability_requests
       SET status = 'ASSIGNED',
           resolved_office_location_id = ?,
           resolved_standing_assignment_id = ?,
           resolved_at = NOW(),
           resolved_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [officeId, assignmentId, req.user.id, requestId]
    );

    await conn.commit();
    res.json({ ok: true, assignmentId, temporaryUntilDate: untilDate });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

export const denyOfficeAvailabilityRequest = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const requestId = parseIntSafe(req.params.id);
    if (!requestId) return res.status(400).json({ error: { message: 'Request ID is required' } });

    const [reqRows] = await pool.execute(
      `SELECT id, status FROM provider_office_availability_requests
       WHERE id = ? AND agency_id = ? LIMIT 1`,
      [requestId, agencyId]
    );
    const reqRow = reqRows?.[0] || null;
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });
    if (String(reqRow.status || '').toUpperCase() !== 'PENDING') {
      return res.status(409).json({ error: { message: 'Request is not pending (already approved or denied)' } });
    }

    await pool.execute(
      `UPDATE provider_office_availability_requests
       SET status = 'CANCELLED',
           resolved_at = NOW(),
           resolved_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.id, requestId]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listSchoolAvailabilityRequests = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const status = String(req.query.status || 'PENDING').toUpperCase();
    const allowedStatus = new Set(['PENDING', 'ASSIGNED', 'CANCELLED']);
    const st = allowedStatus.has(status) ? status : 'PENDING';

    const [rows] = await pool.execute(
      `SELECT r.*,
              u.first_name AS provider_first_name,
              u.last_name AS provider_last_name
       FROM provider_school_availability_requests r
       JOIN users u ON u.id = r.provider_id
       WHERE r.agency_id = ?
         AND r.status = ?
       ORDER BY r.created_at DESC
       LIMIT 500`,
      [agencyId, st]
    );

    const out = [];
    for (const r of rows || []) {
      const [blockRows] = await pool.execute(
        `SELECT day_of_week, block_type, start_time, end_time
         FROM provider_school_availability_request_blocks
         WHERE request_id = ?
         ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
        [r.id]
      );
      out.push({
        id: r.id,
        agencyId: r.agency_id,
        providerId: r.provider_id,
        providerName: `${r.provider_first_name || ''} ${r.provider_last_name || ''}`.trim(),
        preferredSchoolOrgIds: r.preferred_school_org_ids_json ? JSON.parse(r.preferred_school_org_ids_json) : [],
        notes: r.notes || '',
        status: r.status,
        createdAt: r.created_at,
        blocks: (blockRows || []).map((b) => ({
          dayOfWeek: b.day_of_week,
          blockType: b.block_type,
          startTime: String(b.start_time || '').slice(0, 5),
          endTime: String(b.end_time || '').slice(0, 5)
        }))
      });
    }

    res.json(out);
  } catch (e) {
    next(e);
  }
};

function normalizeAnyDay(d) {
  // For legacy provider_school_assignments, we store day_of_week as string (Monday..Friday in older UI).
  return normalizeDayName(d);
}

export const assignSchoolFromRequest = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const requestId = parseIntSafe(req.params.id);
    const schoolOrganizationId = parseIntSafe(req.body?.schoolOrganizationId);
    const dayOfWeek = normalizeAnyDay(req.body?.dayOfWeek);
    const startTime = normalizeTimeHHMM(req.body?.startTime) || null;
    const endTime = normalizeTimeHHMM(req.body?.endTime) || null;
    const slotsTotal = parseIntSafe(req.body?.slotsTotal) ?? 1;
    if (!requestId || !schoolOrganizationId || !dayOfWeek) {
      return res.status(400).json({ error: { message: 'requestId, schoolOrganizationId, and dayOfWeek are required' } });
    }
    if (!(Number.isFinite(slotsTotal) && slotsTotal >= 0)) {
      return res.status(400).json({ error: { message: 'slotsTotal must be a non-negative number' } });
    }

    // Ensure school is linked to agency (organization affiliation)
    const [aff] = await pool.execute(
      `SELECT id
       FROM organization_affiliations
       WHERE agency_id = ? AND organization_id = ? AND is_active = TRUE
       LIMIT 1`,
      [agencyId, schoolOrganizationId]
    );
    if (!aff?.[0] && req.user?.role !== 'super_admin') {
      return res.status(400).json({ error: { message: 'School is not linked to this agency' } });
    }

    const [reqRows] = await pool.execute(
      `SELECT *
       FROM provider_school_availability_requests
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [requestId, agencyId]
    );
    const reqRow = reqRows?.[0] || null;
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });
    if (String(reqRow.status || '').toUpperCase() !== 'PENDING') {
      return res.status(409).json({ error: { message: 'Request is not pending' } });
    }

    // Enforce chosen day/time overlaps a submitted block
    const [blockRows] = await pool.execute(
      `SELECT start_time, end_time
       FROM provider_school_availability_request_blocks
       WHERE request_id = ? AND day_of_week = ?
       LIMIT 50`,
      [requestId, dayOfWeek]
    );
    if (!blockRows?.length) return res.status(400).json({ error: { message: 'Selected day is not present in the submitted availability' } });
    if (startTime && endTime) {
      const okOverlap = blockRows.some((b) => {
        const s = String(b.start_time || '').slice(0, 8);
        const e = String(b.end_time || '').slice(0, 8);
        return !(endTime <= s || startTime >= e);
      });
      if (!okOverlap) return res.status(400).json({ error: { message: 'Selected time does not overlap the submitted availability' } });
    }

    const providerUserId = Number(reqRow.provider_id);

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Upsert into provider_school_assignments (legacy table)
    const [existing] = await conn.execute(
      `SELECT id, slots_total, slots_available
       FROM provider_school_assignments
       WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
       LIMIT 1`,
      [providerUserId, schoolOrganizationId, dayOfWeek]
    );

    let assignmentId = null;
    if (!existing?.[0]) {
      const [ins] = await conn.execute(
        `INSERT INTO provider_school_assignments
          (provider_user_id, school_organization_id, day_of_week, slots_total, slots_available, start_time, end_time, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [providerUserId, schoolOrganizationId, dayOfWeek, slotsTotal, slotsTotal, startTime, endTime]
      );
      assignmentId = ins.insertId;
    } else {
      const oldTotal = parseInt(existing[0].slots_total ?? 0, 10);
      const oldAvail = parseInt(existing[0].slots_available ?? 0, 10);
      const used = Math.max(0, oldTotal - oldAvail);
      const nextSlotsAvailable = Math.max(0, slotsTotal - used);
      assignmentId = existing[0].id;
      await conn.execute(
        `UPDATE provider_school_assignments
         SET slots_total = ?, slots_available = ?, start_time = ?, end_time = ?, is_active = TRUE
         WHERE id = ?`,
        [slotsTotal, nextSlotsAvailable, startTime, endTime, assignmentId]
      );
    }

    // Keep School Portal weekday/provider rows in sync with provider work-hour config.
    await syncSchoolPortalDayProvider({
      executor: conn,
      schoolId: schoolOrganizationId,
      providerUserId,
      weekday: dayOfWeek,
      isActive: true,
      actorUserId: req.user?.id
    });

    await conn.execute(
      `UPDATE provider_school_availability_requests
       SET status = 'ASSIGNED',
           resolved_school_organization_id = ?,
           resolved_provider_school_assignment_id = ?,
           resolved_at = NOW(),
           resolved_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [schoolOrganizationId, assignmentId, req.user.id, requestId]
    );

    await conn.commit();
    res.json({ ok: true, providerSchoolAssignmentId: assignmentId });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

function normalizeSkillKey(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  const cleaned = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  return cleaned || null;
}

export const listAvailableSkills = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_available_skills
       WHERE agency_id = ?
       ORDER BY is_active DESC, skill_label ASC`,
      [agencyId]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const upsertAvailableSkill = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const label = String(req.body?.skillLabel || '').trim().slice(0, 128);
    if (!label) return res.status(400).json({ error: { message: 'skillLabel is required' } });

    const key = normalizeSkillKey(req.body?.skillKey || label);
    if (!key) return res.status(400).json({ error: { message: 'Invalid skillKey' } });

    await pool.execute(
      `INSERT INTO agency_available_skills (agency_id, skill_key, skill_label, is_active)
       VALUES (?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE skill_label = VALUES(skill_label), is_active = TRUE, updated_at = CURRENT_TIMESTAMP`,
      [agencyId, key, label]
    );
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_available_skills
       WHERE agency_id = ? AND skill_key = ?
       LIMIT 1`,
      [agencyId, key]
    );
    res.json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
};

export const deactivateAvailableSkill = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const skillId = parseIntSafe(req.params.skillId);
    if (!skillId) return res.status(400).json({ error: { message: 'Invalid skillId' } });
    await pool.execute(
      `UPDATE agency_available_skills
       SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND agency_id = ?`,
      [skillId, agencyId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const setProviderSkills = async (req, res, next) => {
  let conn = null;
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const providerId = parseIntSafe(req.params.providerId);
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid providerId' } });
    const skillIds = Array.isArray(req.body?.skillIds) ? req.body.skillIds : [];
    const ids = skillIds.map((n) => parseIntSafe(n)).filter((n) => Number.isInteger(n) && n > 0);

    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT id FROM agency_available_skills WHERE agency_id = ? AND id IN (${placeholders})`,
        [agencyId, ...ids]
      );
      const allowed = new Set((rows || []).map((r) => Number(r.id)));
      const bad = ids.filter((id) => !allowed.has(Number(id)));
      if (bad.length) return res.status(400).json({ error: { message: 'One or more skills are not valid for this agency' } });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.execute(
      `DELETE FROM provider_available_skills WHERE agency_id = ? AND provider_id = ?`,
      [agencyId, providerId]
    );
    for (const sid of ids) {
      await conn.execute(
        `INSERT INTO provider_available_skills (agency_id, provider_id, skill_id)
         VALUES (?, ?, ?)`,
        [agencyId, providerId, sid]
      );
    }
    await conn.commit();
    res.json({ ok: true, providerId, agencyId, skillIds: ids });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

export const listProvidersForAvailability = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const role = String(req.user?.role || '').toLowerCase();
    const isSupervisor = role === 'supervisor';
    const intakeLab = String(req.query.intakeLab || 'false').toLowerCase() === 'true';
    const scope = String(req.query.scope || '').toLowerCase();
    const intakeScope = intakeLab || scope === 'intake';
    if (!canManageAvailability(role) && !isSupervisor) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    let rows;
    if (intakeScope) {
      const [clientFacingRows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
           AND (
             u.role IN ('provider', 'supervisor', 'clinical_practice_assistant', 'admin', 'super_admin', 'staff', 'support')
             OR u.has_provider_access = TRUE
           )
           AND LOWER(COALESCE(u.role, '')) NOT IN ('guardian', 'school_support')
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [agencyId]
      );
      rows = clientFacingRows;
    } else if (isSupervisor) {
      const [superviseeRows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role
         FROM supervisor_assignments sa
         JOIN users u ON u.id = sa.supervisee_id
         WHERE sa.agency_id = ?
           AND sa.supervisor_id = ?
           AND (u.role IN ('provider') OR u.has_provider_access = TRUE)
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [agencyId, req.user.id]
      );
      rows = superviseeRows;
    } else {
      const [providerRows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?
           AND (u.role IN ('provider') OR u.has_provider_access = TRUE)
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [agencyId]
      );
      rows = providerRows;
    }
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const listIntakeAvailabilityCards = async (req, res, next) => {
  try {
    const requestedAgencyIds = String(req.query.agencyIds || '')
      .split(',')
      .map((v) => parseIntSafe(v))
      .filter((n) => Number.isInteger(n) && n > 0);
    const resolvedAgencyId = await resolveAgencyId(req);
    const agencyIds = requestedAgencyIds.length
      ? Array.from(new Set(requestedAgencyIds))
      : (resolvedAgencyId ? [Number(resolvedAgencyId)] : []);
    if (!agencyIds.length) {
      return res.status(400).json({ error: { message: 'agencyId or agencyIds is required' } });
    }

    for (const aid of agencyIds) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await requireAgencyMembership(req, res, aid))) return;
    }
    const role = String(req.user?.role || '').toLowerCase();
    const isSupervisor = role === 'supervisor';
    if (!canManageAvailability(role) && !isSupervisor) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const weekStartYmd = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);

    // Performance: materialize office_events once per request (not per provider).
    // ProviderAvailabilityService can also materialize, but that is too expensive in aggregate.
    try {
      const agencyIdSet = new Set(agencyIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0));
      const monday = startOfWeekMonday(weekStartYmd);
      const anchor = toYmd(monday);
      const windowStart = `${anchor} 00:00:00`;
      const windowEnd = `${toYmd(addDays(monday, 7))} 00:00:00`;
      for (const aid of Array.from(agencyIdSet.values())) {
        // eslint-disable-next-line no-await-in-loop
        const [officeRows] = await pool.execute(
          `SELECT DISTINCT ola.office_location_id
           FROM office_location_agencies ola
           JOIN office_locations ol ON ol.id = ola.office_location_id
           WHERE ola.agency_id = ?
             AND ol.is_active = TRUE`,
          [Number(aid)]
        );
        const officeIds = (officeRows || [])
          .map((r) => Number(r.office_location_id))
          .filter((n) => Number.isInteger(n) && n > 0);
        for (const officeLocationId of officeIds) {
          // Skip materialization if the week already has any office_events rows.
          // eslint-disable-next-line no-await-in-loop
          const [existing] = await pool.execute(
            `SELECT 1
             FROM office_events
             WHERE office_location_id = ?
               AND start_at >= ?
               AND start_at < ?
             LIMIT 1`,
            [Number(officeLocationId), windowStart, windowEnd]
          );
          if (existing?.[0]) continue;
          // eslint-disable-next-line no-await-in-loop
          await OfficeScheduleMaterializer.materializeWeek({
            officeLocationId,
            weekStartRaw: anchor,
            createdByUserId: req.user?.id || null
          });
        }
      }
    } catch (e) {
      // Best-effort only; materialization is an optimization.
      if (e?.code !== 'ER_NO_SUCH_TABLE') {
        // ignore
      }
    }

    const providerById = new Map();
    const pairs = [];

    // Best-effort: include provider profile photos when the column exists.
    let hasProfilePhotoPath = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_photo_path' LIMIT 1"
      );
      hasProfilePhotoPath = (cols || []).length > 0;
    } catch {
      hasProfilePhotoPath = false;
    }

    const photoSelect = hasProfilePhotoPath ? ', u.profile_photo_path' : '';
    for (const aid of agencyIds) {
      // eslint-disable-next-line no-await-in-loop
      const [providerRows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role${photoSelect}
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
           AND (
             u.role IN ('provider', 'supervisor', 'clinical_practice_assistant', 'admin', 'super_admin', 'staff', 'support')
             OR u.has_provider_access = TRUE
           )
           AND LOWER(COALESCE(u.role, '')) NOT IN ('guardian', 'school_support')
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [aid]
      );
      for (const r of providerRows || []) {
        const pid = Number(r.id || 0);
        if (!pid) continue;
        if (!providerById.has(pid)) {
          providerById.set(pid, {
            providerId: pid,
            firstName: String(r.first_name || '').trim(),
            lastName: String(r.last_name || '').trim(),
            profilePhotoUrl: hasProfilePhotoPath ? publicUploadsUrlFromStoredPath(r.profile_photo_path) : null
          });
        }
        pairs.push({ agencyId: aid, providerId: pid });
      }
    }

    const aggregate = new Map();
    const seenInPerson = new Map();
    const seenVirtual = new Map();
    const pairQueue = [...pairs];
    const concurrency = 8;
    const workers = Array.from({ length: concurrency }).map(async () => {
      while (pairQueue.length) {
        const pair = pairQueue.shift();
        if (!pair) break;
        try {
          // eslint-disable-next-line no-await-in-loop
          const avail = await ProviderAvailabilityService.computeWeekAvailability({
            agencyId: Number(pair.agencyId),
            providerId: Number(pair.providerId),
            weekStartYmd,
            includeGoogleBusy: false,
            includeExternalBusy: false,
            externalCalendarIds: [],
            slotMinutes: 60,
            intakeOnly: true,
            materializeOfficeEvents: false
          });
          const inPersonSlots = Array.isArray(avail?.inPersonSlots) ? avail.inPersonSlots : [];
          const virtualSlots = Array.isArray(avail?.virtualSlots) ? avail.virtualSlots : [];
          if (!inPersonSlots.length && !virtualSlots.length) continue;

          if (!aggregate.has(pair.providerId)) {
            const base = providerById.get(pair.providerId);
            aggregate.set(pair.providerId, {
              providerId: Number(pair.providerId),
              firstName: String(base?.firstName || '').trim(),
              lastName: String(base?.lastName || '').trim(),
              profilePhotoUrl: base?.profilePhotoUrl || null,
              inPersonSlots: [],
              virtualSlots: [],
              agencyIds: []
            });
          }
          const rec = aggregate.get(pair.providerId);
          if (!rec.agencyIds.includes(Number(pair.agencyId))) rec.agencyIds.push(Number(pair.agencyId));

          if (!seenInPerson.has(pair.providerId)) seenInPerson.set(pair.providerId, new Set());
          if (!seenVirtual.has(pair.providerId)) seenVirtual.set(pair.providerId, new Set());
          const inPersonSet = seenInPerson.get(pair.providerId);
          const virtualSet = seenVirtual.get(pair.providerId);

          for (const s of inPersonSlots) {
            const k = `${String(s?.startAt || '')}|${String(s?.endAt || '')}|${String(s?.buildingId || '')}|${String(s?.roomId || '')}`;
            if (inPersonSet.has(k)) continue;
            inPersonSet.add(k);
            rec.inPersonSlots.push(s);
          }
          for (const s of virtualSlots) {
            const k = `${String(s?.startAt || '')}|${String(s?.endAt || '')}|${String(s?.buildingId || '')}|${String(s?.roomId || '')}`;
            if (virtualSet.has(k)) continue;
            virtualSet.add(k);
            rec.virtualSlots.push(s);
          }
        } catch {
          // skip provider-level failures for this aggregate response
        }
      }
    });
    await Promise.all(workers);

    const out = Array.from(aggregate.values());
    out.sort((a, b) => `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`));
    res.json({
      ok: true,
      agencyId: agencyIds.length === 1 ? Number(agencyIds[0]) : null,
      agencyIds,
      weekStart: weekStartYmd,
      providers: out
    });
  } catch (e) {
    next(e);
  }
};

export const providerAvailabilityDashboard = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canViewAvailabilityDashboard(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const providerId = req.query.providerId ? parseIntSafe(req.query.providerId) : null;
    const schoolOrganizationId = req.query.schoolOrganizationId ? parseIntSafe(req.query.schoolOrganizationId) : null;
    const officeLocationId = req.query.officeLocationId ? parseIntSafe(req.query.officeLocationId) : null;
    const dayOfWeek = req.query.dayOfWeek ? normalizeDayName(req.query.dayOfWeek) : null; // Monday..Sunday
    const weekday =
      req.query.weekday !== undefined && req.query.weekday !== null && req.query.weekday !== ''
        ? parseIntSafe(req.query.weekday)
        : null; // 0..6
    const hour =
      req.query.hour !== undefined && req.query.hour !== null && req.query.hour !== ''
        ? parseIntSafe(req.query.hour)
        : null; // 0..23
    const includeInactive = String(req.query.includeInactive || 'false').toLowerCase() === 'true';

    // Providers list (for filter dropdowns)
    const [providers] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE (u.role IN ('provider') OR u.has_provider_access = TRUE)
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [agencyId]
    );

    // Affiliated orgs (schools/programs/learning), for school filter dropdown.
    const [organizations] = await pool.execute(
      `SELECT a.id, a.name, a.organization_type
       FROM agencies a
       JOIN organization_affiliations oa ON oa.organization_id = a.id
       WHERE oa.agency_id = ? AND oa.is_active = TRUE
       ORDER BY a.name ASC`,
      [agencyId]
    );

    // Offices accessible by this agency (multi-agency join table).
    const [offices] = await pool.execute(
      `SELECT ol.id, ol.name, ol.timezone, ol.is_active
       FROM office_locations ol
       JOIN office_location_agencies ola ON ola.office_location_id = ol.id
       WHERE ola.agency_id = ?
       ORDER BY ol.name ASC`,
      [agencyId]
    );

    // ---- School slots/assignments
    const schoolWhere = ['oa.agency_id = ?', includeInactive ? '1=1' : 'psa.is_active = TRUE'];
    const schoolParams = [agencyId];
    if (providerId) {
      schoolWhere.push('psa.provider_user_id = ?');
      schoolParams.push(providerId);
    }
    if (schoolOrganizationId) {
      schoolWhere.push('psa.school_organization_id = ?');
      schoolParams.push(schoolOrganizationId);
    }
    if (dayOfWeek) {
      schoolWhere.push('psa.day_of_week = ?');
      schoolParams.push(dayOfWeek);
    }

    const [schoolRows] = await pool.execute(
      `SELECT
         psa.id,
         psa.provider_user_id,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name,
         psa.school_organization_id,
         s.name AS school_name,
         psa.day_of_week,
         psa.start_time,
         psa.end_time,
         psa.slots_total,
         psa.slots_available,
         psa.is_active,
         psa.accepting_new_clients_override
       FROM provider_school_assignments psa
       JOIN agencies s ON s.id = psa.school_organization_id
       JOIN users u ON u.id = psa.provider_user_id
       JOIN user_agencies ua ON ua.user_id = psa.provider_user_id AND ua.agency_id = ?
       JOIN organization_affiliations oa ON oa.organization_id = psa.school_organization_id AND oa.is_active = TRUE
       WHERE ${schoolWhere.join(' AND ')}
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
       ORDER BY s.name ASC,
                FIELD(psa.day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') ASC,
                u.last_name ASC, u.first_name ASC`,
      [agencyId, ...schoolParams]
    );

    const schoolSlots = (schoolRows || []).map((r) => ({
      id: r.id,
      schoolOrganizationId: r.school_organization_id,
      schoolName: r.school_name || '',
      providerId: r.provider_user_id,
      providerName: `${r.provider_first_name || ''} ${r.provider_last_name || ''}`.trim(),
      dayOfWeek: r.day_of_week,
      startTime: r.start_time ? String(r.start_time).slice(0, 5) : '',
      endTime: r.end_time ? String(r.end_time).slice(0, 5) : '',
      slotsTotal: Number(r.slots_total || 0),
      slotsAvailable: Number(r.slots_available || 0),
      isActive: !!r.is_active,
      acceptingNewClientsOverride: r.accepting_new_clients_override === null ? null : !!r.accepting_new_clients_override
    }));

    // ---- Office standing assignments (repeating office availability)
    const officeWhere = ['ola.agency_id = ?', includeInactive ? '1=1' : 'osa.is_active = TRUE'];
    const officeParams = [agencyId];
    if (providerId) {
      officeWhere.push('osa.provider_id = ?');
      officeParams.push(providerId);
    }
    if (officeLocationId) {
      officeWhere.push('osa.office_location_id = ?');
      officeParams.push(officeLocationId);
    }
    const effectiveWeekday = Number.isInteger(weekday) ? weekday : (dayOfWeek ? weekdayIntFromDayName(dayOfWeek) : null);
    if (Number.isInteger(effectiveWeekday)) {
      officeWhere.push('osa.weekday = ?');
      officeParams.push(effectiveWeekday);
    }
    if (Number.isInteger(hour)) {
      officeWhere.push('osa.hour = ?');
      officeParams.push(hour);
    }

    const [officeRows] = await pool.execute(
      `SELECT
         osa.id,
         osa.office_location_id,
         ol.name AS office_name,
         ol.timezone AS office_timezone,
         osa.room_id,
         r.name AS room_name,
         r.room_number AS room_number,
         r.label AS room_label,
         osa.provider_id,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name,
         osa.weekday,
         osa.hour,
         osa.assigned_frequency,
         osa.availability_mode,
         osa.temporary_until_date,
         osa.available_since_date,
         osa.is_active
       FROM office_standing_assignments osa
       JOIN office_locations ol ON ol.id = osa.office_location_id
       JOIN office_location_agencies ola ON ola.office_location_id = ol.id
       JOIN office_rooms r ON r.id = osa.room_id
       JOIN users u ON u.id = osa.provider_id
       JOIN user_agencies ua ON ua.user_id = osa.provider_id AND ua.agency_id = ?
       WHERE ${officeWhere.join(' AND ')}
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
       ORDER BY ol.name ASC, u.last_name ASC, u.first_name ASC, osa.weekday ASC, osa.hour ASC`,
      [agencyId, ...officeParams]
    );

    const officeAvailability = (officeRows || []).map((r) => {
      const dayName = dayNameFromWeekdayInt(r.weekday) || '';
      const h = Number(r.hour);
      const hh = Number.isInteger(h) ? String(h).padStart(2, '0') : '';
      const startTime = hh ? `${hh}:00` : '';
      const endTime = hh ? `${String((h + 1) % 24).padStart(2, '0')}:00` : '';
      const roomLabel = String(r.room_label || '').trim() || String(r.room_number || '').trim() || String(r.room_name || '').trim();
      return {
        id: r.id,
        officeLocationId: r.office_location_id,
        officeName: r.office_name || '',
        officeTimezone: r.office_timezone || '',
        roomId: r.room_id,
        roomLabel,
        providerId: r.provider_id,
        providerName: `${r.provider_first_name || ''} ${r.provider_last_name || ''}`.trim(),
        weekday: Number(r.weekday),
        dayOfWeek: dayName,
        hour: Number(r.hour),
        startTime,
        endTime,
        assignedFrequency: r.assigned_frequency,
        availabilityMode: r.availability_mode,
        temporaryUntilDate: r.temporary_until_date ? String(r.temporary_until_date).slice(0, 10) : null,
        availableSinceDate: r.available_since_date ? String(r.available_since_date).slice(0, 10) : null,
        isActive: !!r.is_active
      };
    });

    // ---- Virtual working hours templates
    const virtualWhere = ['v.agency_id = ?'];
    const virtualParams = [agencyId];
    if (providerId) {
      virtualWhere.push('v.provider_id = ?');
      virtualParams.push(providerId);
    }
    if (dayOfWeek) {
      virtualWhere.push('v.day_of_week = ?');
      virtualParams.push(dayOfWeek);
    }

    let virtualRows = [];
    try {
      const [rows] = await pool.execute(
        `SELECT
           v.provider_id,
           u.first_name AS provider_first_name,
           u.last_name AS provider_last_name,
           v.day_of_week,
           v.start_time,
           v.end_time,
           v.session_type,
           v.frequency
         FROM provider_virtual_working_hours v
         JOIN users u ON u.id = v.provider_id
         JOIN user_agencies ua ON ua.user_id = v.provider_id AND ua.agency_id = ?
         WHERE ${virtualWhere.join(' AND ')}
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
         ORDER BY u.last_name ASC, u.first_name ASC,
                  FIELD(v.day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'),
                  v.start_time ASC`,
        [agencyId, ...virtualParams]
      );
      virtualRows = rows || [];
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') virtualRows = [];
      else throw e;
    }

    const virtualWorkingHours = (virtualRows || []).map((r) => ({
      providerId: r.provider_id,
      providerName: `${r.provider_first_name || ''} ${r.provider_last_name || ''}`.trim(),
      dayOfWeek: r.day_of_week,
      startTime: r.start_time ? String(r.start_time).slice(0, 5) : '',
      endTime: r.end_time ? String(r.end_time).slice(0, 5) : '',
      sessionType: r.session_type || 'REGULAR',
      frequency: r.frequency || 'WEEKLY'
    }));

    res.json({
      ok: true,
      agencyId,
      filters: { providerId, schoolOrganizationId, officeLocationId, dayOfWeek, weekday: effectiveWeekday, hour, includeInactive },
      providers: providers || [],
      organizations: organizations || [],
      offices: offices || [],
      schoolSlots,
      officeAvailability,
      virtualWorkingHours
    });
  } catch (e) {
    next(e);
  }
};

export const searchAvailability = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const officeId = req.query.officeId ? parseIntSafe(req.query.officeId) : null;
    const schoolOrgId = req.query.schoolOrgId ? parseIntSafe(req.query.schoolOrgId) : null;
    const weekStart = String(req.query.weekStart || '').slice(0, 10);
    const weekStartDate = /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? weekStart : toYmd(startOfWeekMonday(new Date()));
    const skillIdsRaw = String(req.query.skillIds || '').trim();
    const skillIds = skillIdsRaw
      ? skillIdsRaw.split(',').map((x) => parseIntSafe(x)).filter((n) => Number.isInteger(n) && n > 0)
      : [];

    // Office requests (pending)
    let officeReqWhere = `r.agency_id = ? AND r.status = 'PENDING'`;
    const officeReqParams = [agencyId];
    if (officeId) {
      // preferred_office_ids_json NULL means "any"
      officeReqWhere += ` AND (r.preferred_office_ids_json IS NULL OR JSON_CONTAINS(r.preferred_office_ids_json, CAST(? AS JSON), '$'))`;
      officeReqParams.push(String(officeId));
    }
    const [officeReqRows] = await pool.execute(
      `SELECT r.id, r.provider_id, r.preferred_office_ids_json, r.notes, r.created_at,
              u.first_name, u.last_name
       FROM provider_office_availability_requests r
       JOIN users u ON u.id = r.provider_id
       WHERE ${officeReqWhere}
       ORDER BY r.created_at DESC
       LIMIT 500`,
      officeReqParams
    );

    // School requests (pending)
    let schoolReqWhere = `r.agency_id = ? AND r.status = 'PENDING'`;
    const schoolReqParams = [agencyId];
    if (schoolOrgId) {
      schoolReqWhere += ` AND (r.preferred_school_org_ids_json IS NULL OR JSON_CONTAINS(r.preferred_school_org_ids_json, CAST(? AS JSON), '$'))`;
      schoolReqParams.push(String(schoolOrgId));
    }
    const [schoolReqRows] = await pool.execute(
      `SELECT r.id, r.provider_id, r.preferred_school_org_ids_json, r.notes, r.created_at,
              u.first_name, u.last_name
       FROM provider_school_availability_requests r
       JOIN users u ON u.id = r.provider_id
       WHERE ${schoolReqWhere}
       ORDER BY r.created_at DESC
       LIMIT 500`,
      schoolReqParams
    );

    // Skill Builder confirmations for weekStartDate
    const skillJoin =
      skillIds.length > 0
        ? `JOIN provider_available_skills pas ON pas.provider_id = c.provider_id AND pas.agency_id = c.agency_id AND pas.skill_id IN (${skillIds.map(() => '?').join(',')})`
        : '';
    const skillParams = skillIds.length > 0 ? skillIds : [];

    const [skillBuilderConfirmRows] = await pool.execute(
      `SELECT
         c.provider_id,
         u.first_name,
         u.last_name,
         c.week_start_date,
         c.confirmed_at
       FROM provider_skill_builder_availability_confirmations c
       ${skillJoin}
       JOIN users u ON u.id = c.provider_id
       WHERE c.agency_id = ?
         AND c.confirmed_at IS NOT NULL
         AND c.week_start_date = ?
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [...skillParams, agencyId, weekStartDate]
    );

    const skillBuilderProviderIds = Array.from(
      new Set((skillBuilderConfirmRows || []).map((r) => Number(r.provider_id)).filter((n) => Number.isInteger(n) && n > 0))
    );
    let skillBuilderBlocksByProvider = new Map();
    if (skillBuilderProviderIds.length) {
      const placeholders = skillBuilderProviderIds.map(() => '?').join(',');
      const [blockRows] = await pool.execute(
        `SELECT provider_id, day_of_week, block_type, start_time, end_time, depart_from, depart_time, is_booked
         FROM provider_skill_builder_availability
         WHERE agency_id = ?
           AND provider_id IN (${placeholders})
         ORDER BY provider_id ASC,
                  FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'),
                  start_time ASC`,
        [agencyId, ...skillBuilderProviderIds]
      );
      skillBuilderBlocksByProvider = (blockRows || []).reduce((acc, b) => {
        const pid = Number(b.provider_id);
        if (!acc.has(pid)) acc.set(pid, []);
        acc.get(pid).push({
          dayOfWeek: b.day_of_week,
          blockType: b.block_type,
          startTime: String(b.start_time || '').slice(0, 5),
          endTime: String(b.end_time || '').slice(0, 5),
          departFrom: String(b.depart_from || '').trim(),
          departTime: b.depart_time ? String(b.depart_time).slice(0, 5) : '',
          isBooked: b.is_booked === true || b.is_booked === 1 || b.is_booked === '1'
        });
        return acc;
      }, new Map());
    }

    // Optional: office availability grid (provider_in_office_availability) if officeId provided
    let inOffice = [];
    if (officeId) {
      try {
        const [rows] = await pool.execute(
          `SELECT a.provider_id, u.first_name, u.last_name, a.weekday, a.hour
           FROM provider_in_office_availability a
           JOIN users u ON u.id = a.provider_id
           WHERE a.office_location_id = ?
             AND a.is_available = TRUE
           ORDER BY u.last_name ASC, u.first_name ASC, a.weekday ASC, a.hour ASC`,
          [officeId]
        );
        inOffice = rows || [];
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }

    // Shape results
    const skillBuilderByProvider = new Map();
    for (const r of skillBuilderConfirmRows || []) {
      const pid = Number(r.provider_id);
      if (!skillBuilderByProvider.has(pid)) {
        const wk = String(r.week_start_date || '').slice(0, 10);
        skillBuilderByProvider.set(pid, {
          providerId: pid,
          providerName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          weekStartDate: wk,
          confirmedAt: r.confirmed_at,
          blocks: skillBuilderBlocksByProvider.get(pid) || []
        });
      }
    }

    res.json({
      ok: true,
      agencyId,
      filters: { officeId, schoolOrgId, weekStart: weekStartDate, skillIds },
      officeRequests: (officeReqRows || []).map((r) => ({
        id: r.id,
        providerId: r.provider_id,
        providerName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        preferredOfficeIds: r.preferred_office_ids_json ? JSON.parse(r.preferred_office_ids_json) : [],
        notes: r.notes || '',
        createdAt: r.created_at
      })),
      schoolRequests: (schoolReqRows || []).map((r) => ({
        id: r.id,
        providerId: r.provider_id,
        providerName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        preferredSchoolOrgIds: r.preferred_school_org_ids_json ? JSON.parse(r.preferred_school_org_ids_json) : [],
        notes: r.notes || '',
        createdAt: r.created_at
      })),
      skillBuilderAvailability: Array.from(skillBuilderByProvider.values()),
      inOfficeAvailability: inOffice
    });
  } catch (e) {
    next(e);
  }
};

export const listPublicAppointmentRequests = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    let rows = [];
    try {
      rows = await PublicAppointmentRequest.listPending({ agencyId, limit: 300 });
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, agencyId, requests: [] });
      throw e;
    }

    const ids = Array.from(new Set((rows || []).map((r) => Number(r.provider_id)).filter((n) => Number.isInteger(n) && n > 0)));
    const providerNames = new Map();
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const [urows] = await pool.execute(
        `SELECT id, first_name, last_name
         FROM users
         WHERE id IN (${placeholders})`,
        ids
      );
      for (const u of urows || []) {
        providerNames.set(Number(u.id), `${u.first_name || ''} ${u.last_name || ''}`.trim());
      }
    }

    res.json({
      ok: true,
      agencyId,
      requests: (rows || []).map((r) => ({
        id: r.id,
        providerId: r.provider_id,
        providerName: providerNames.get(Number(r.provider_id)) || `#${r.provider_id}`,
        modality: r.modality,
        bookingMode: r.booking_mode || null,
        programType: r.program_type || null,
        requestedStartAt: r.requested_start_at,
        requestedEndAt: r.requested_end_at,
        clientName: r.client_name,
        clientEmail: r.client_email,
        clientPhone: r.client_phone,
        clientInitials: r.client_initials || null,
        matchedClientId: r.matched_client_id || null,
        createdClientId: r.created_client_id || null,
        createdGuardianUserId: r.created_guardian_user_id || null,
        notes: r.notes || '',
        status: r.status,
        createdAt: r.created_at
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const setPublicAppointmentRequestStatus = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const requestId = parseIntSafe(req.params.id);
    if (!requestId) return res.status(400).json({ error: { message: 'Invalid request id' } });

    const status = String(req.body?.status || '').trim().toUpperCase();
    if (!['APPROVED', 'DECLINED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: { message: 'status must be APPROVED, DECLINED, or CANCELLED' } });
    }

    try {
      const existing = await PublicAppointmentRequest.findById({ agencyId, requestId });
      if (!existing) return res.status(404).json({ error: { message: 'Request not found' } });
      if (String(existing.status || '').toUpperCase() !== 'PENDING') {
        return res.status(409).json({ error: { message: `Request already ${String(existing.status || '').toLowerCase()}` } });
      }

      if (status === 'APPROVED') {
        const stillAvailable = await requestStillAvailable({ agencyId, requestRow: existing });
        if (!stillAvailable) {
          return res.status(409).json({
            error: {
              message: 'Requested time is no longer available. Refresh and ask client to select a new slot.'
            }
          });
        }
      }

      const ok = await PublicAppointmentRequest.setStatus({ agencyId, requestId, status });
      if (!ok) return res.status(404).json({ error: { message: 'Request not found' } });

      let updatedRow = null;
      if (status === 'APPROVED') {
        updatedRow = await PublicAppointmentRequest.findById({ agencyId, requestId });
        if (updatedRow) {
          await ensureClientProviderLinkedForRequest({ requestRow: updatedRow, actorUserId: req.user?.id || null });
        }
      }

      const postUpdate = updatedRow || (await PublicAppointmentRequest.findById({ agencyId, requestId }));
      if (postUpdate) {
        await sendPublicRequestDecisionNotifications({
          agencyId,
          requestRow: postUpdate,
          status,
          actorUserId: req.user?.id || null
        });
      }
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return res.status(409).json({ error: { message: 'Migrations not applied yet' } });
      throw e;
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getAdminPendingCounts = async (req, res, next) => {
  try {
    if (!canManageAvailability(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const role = String(req.user?.role || '').toLowerCase();
    let officeRequestsPending = 0;
    let schoolRequestsPending = 0;

    if (role === 'super_admin') {
      try {
        const [[o]] = await pool.execute(
          `SELECT COUNT(*) AS c FROM provider_office_availability_requests WHERE status = 'PENDING'`
        );
        const [[s]] = await pool.execute(
          `SELECT COUNT(*) AS c FROM provider_school_availability_requests WHERE status = 'PENDING'`
        );
        officeRequestsPending = Number(o?.c || 0);
        schoolRequestsPending = Number(s?.c || 0);
      } catch (e) {
        if (e?.code === 'ER_NO_SUCH_TABLE') {
          officeRequestsPending = 0;
          schoolRequestsPending = 0;
        } else {
          throw e;
        }
      }
    } else {
      const agencies = await User.getAgencies(req.user.id);
      const agencyIds = (agencies || [])
        .map((a) => parseIntSafe(a?.id))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (agencyIds.length === 0) {
        return res.json({ ok: true, officeRequestsPending: 0, schoolRequestsPending: 0, total: 0 });
      }
      const placeholders = agencyIds.map(() => '?').join(',');
      try {
        const [[o]] = await pool.execute(
          `SELECT COUNT(*) AS c
           FROM provider_office_availability_requests
           WHERE status = 'PENDING' AND agency_id IN (${placeholders})`,
          agencyIds
        );
        const [[s]] = await pool.execute(
          `SELECT COUNT(*) AS c
           FROM provider_school_availability_requests
           WHERE status = 'PENDING' AND agency_id IN (${placeholders})`,
          agencyIds
        );
        officeRequestsPending = Number(o?.c || 0);
        schoolRequestsPending = Number(s?.c || 0);
      } catch (e) {
        if (e?.code === 'ER_NO_SUCH_TABLE') {
          officeRequestsPending = 0;
          schoolRequestsPending = 0;
        } else {
          throw e;
        }
      }
    }

    res.json({
      ok: true,
      officeRequestsPending,
      schoolRequestsPending,
      total: officeRequestsPending + schoolRequestsPending
    });
  } catch (e) {
    next(e);
  }
};

export const getPublicProviderLinkInfo = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      `SELECT id, slug, name, public_availability_enabled, public_availability_access_key, feature_flags
       FROM agencies
       WHERE id = ?
       LIMIT 1`,
      [agencyId]
    );
    const agency = rows?.[0] || null;
    if (!agency) return res.status(404).json({ error: { message: 'Agency not found' } });

    const enabled = isPublicProviderFinderFeatureEnabled(agency);
    let key = String(agency.public_availability_access_key || '').trim();
    if (!key) {
      key = crypto.randomBytes(18).toString('base64url');
      await pool.execute(
        `UPDATE agencies
         SET public_availability_access_key = ?
         WHERE id = ?`,
        [key, agencyId]
      );
    }

    res.json({
      ok: true,
      agencyId: Number(agency.id),
      agencyName: agency.name || '',
      agencySlug: agency.slug || '',
      publicAvailabilityEnabled: enabled,
      publicAvailabilityAccessKey: key,
      providerFinderUrl: buildProviderFinderPublicUrl({ agencyId, key })
    });
  } catch (e) {
    next(e);
  }
};

export const rotatePublicProviderLinkKey = async (req, res, next) => {
  try {
    const agencyId = await resolveAgencyId(req);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const key = crypto.randomBytes(24).toString('base64url');
    const [result] = await pool.execute(
      `UPDATE agencies
       SET public_availability_access_key = ?
       WHERE id = ?`,
      [key, agencyId]
    );
    if (!Number(result?.affectedRows || 0)) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    const [rows] = await pool.execute(
      `SELECT id, slug, name, public_availability_enabled, feature_flags
       FROM agencies
       WHERE id = ?
       LIMIT 1`,
      [agencyId]
    );
    const agency = rows?.[0] || null;
    res.json({
      ok: true,
      agencyId: Number(agency?.id || agencyId),
      agencyName: agency?.name || '',
      agencySlug: agency?.slug || '',
      publicAvailabilityEnabled: isPublicProviderFinderFeatureEnabled(agency || {}),
      publicAvailabilityAccessKey: key,
      providerFinderUrl: buildProviderFinderPublicUrl({ agencyId, key })
    });
  } catch (e) {
    next(e);
  }
};

