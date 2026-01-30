import pool from '../config/database.js';
import User from '../models/User.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import { syncSchoolPortalDayProvider } from '../services/schoolPortalDaySync.service.js';
import ProviderVirtualWorkingHours from '../models/ProviderVirtualWorkingHours.model.js';
import PublicAppointmentRequest from '../models/PublicAppointmentRequest.model.js';
import ProviderAvailabilityService from '../services/providerAvailability.service.js';

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

const canManageAvailability = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'clinical_practice_assistant' || r === 'staff';
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SET = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
const WEEKEND_SET = new Set(['Saturday', 'Sunday']);
const SKILL_BUILDER_MINUTES_PER_WEEK = 6 * 60;

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

    const supervised = await isUserSupervised({ providerId, agencyId });
    const cycleStart = startOfWeekMonday(new Date());
    const cycleEnd = addDays(cycleStart, 13);
    const week1Start = toYmd(cycleStart);
    const week2Start = toYmd(addDays(cycleStart, 7));

    let confirmation = null;
    if (supervised) {
      const [rows] = await pool.execute(
        `SELECT *
         FROM supervised_availability_confirmations
         WHERE agency_id = ? AND provider_id = ? AND cycle_start_date = ?
         LIMIT 1`,
        [agencyId, providerId, week1Start]
      );
      confirmation = rows?.[0] || null;
    }

    // Skill Builder weekly availability (recurring blocks + weekly confirmation)
    const skillBuilderEligible = await getSkillBuilderEligibility(providerId);
    let skillBuilder = {
      eligible: skillBuilderEligible,
      requiredHoursPerWeek: 6,
      totalHoursPerWeek: 0,
      confirmedAt: null,
      needsConfirmation: false,
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
          `SELECT confirmed_at
           FROM provider_skill_builder_availability_confirmations
           WHERE agency_id = ? AND provider_id = ? AND week_start_date = ?
           LIMIT 1`,
          [agencyId, providerId, week1Start]
        );
        const confirmedAt = confRows?.[0]?.confirmed_at || null;
        skillBuilder = {
          eligible: true,
          requiredHoursPerWeek: 6,
          totalHoursPerWeek: Math.round((totalMinutes / 60) * 100) / 100,
          confirmedAt,
          needsConfirmation: !confirmedAt,
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
      supervised: {
        isSupervised: supervised,
        cycleStartDate: week1Start,
        cycleEndDate: toYmd(cycleEnd),
        weekStartDates: [week1Start, week2Start],
        rules: {
          afterSchool: { start: '14:30', end: '17:00' },
          weekend: { start: '11:30', end: '15:30' },
          perWeekMinimum: {
            optionA: '3 blocks including at least one weekend day',
            optionB: '4 blocks (no weekend required)'
          }
        },
        confirmedAt: confirmation?.confirmed_at || null
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

    const isSelf = Number(req.user?.id || 0) === Number(providerId);
    if (!isSelf && !canManageAvailability(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const weekStartYmd = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const includeGoogleBusy = String(req.query.includeGoogleBusy || 'true').toLowerCase() === 'true';
    const slotMinutes = parseIntSafe(req.query.slotMinutes) || 60;
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
      slotMinutes
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

    // Only allow one pending request per provider per agency.
    const [existing] = await pool.execute(
      `SELECT id FROM provider_office_availability_requests
       WHERE agency_id = ? AND provider_id = ? AND status = 'PENDING'
       LIMIT 1`,
      [agencyId, providerId]
    );
    if (existing?.[0]?.id) {
      return res.status(409).json({ error: { message: 'You already have a pending office availability request.' } });
    }

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

    // Upsert weekly confirmation for this week
    await conn.execute(
      `INSERT INTO provider_skill_builder_availability_confirmations
        (agency_id, provider_id, week_start_date, confirmed_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE confirmed_at = VALUES(confirmed_at)`,
      [agencyId, providerId, weekStart]
    );

    await conn.commit();
    res.json({ ok: true, weekStartDate: weekStart, totalHoursPerWeek: Math.round((totalMinutes / 60) * 100) / 100 });
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

    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO provider_skill_builder_availability_confirmations
        (agency_id, provider_id, week_start_date, confirmed_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE confirmed_at = VALUES(confirmed_at)`,
      [agencyId, providerId, weekStart]
    );
    await conn.commit();

    res.json({ ok: true, weekStartDate: weekStart, totalHoursPerWeek: Math.round((totalMinutes / 60) * 100) / 100 });
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
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

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
    if (!canManageAvailability(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND (u.role IN ('provider') OR u.has_provider_access = TRUE)
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [agencyId]
    );
    res.json(rows || []);
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

    // Supervised availability blocks (confirmed) for weekStartDate
    const skillJoin =
      skillIds.length > 0
        ? `JOIN provider_available_skills pas ON pas.provider_id = c.provider_id AND pas.agency_id = c.agency_id AND pas.skill_id IN (${skillIds.map(() => '?').join(',')})`
        : '';
    const skillParams = skillIds.length > 0 ? skillIds : [];

    const [supervisedRows] = await pool.execute(
      `SELECT
         c.provider_id,
         u.first_name,
         u.last_name,
         c.cycle_start_date,
         c.cycle_end_date,
         c.confirmed_at,
         b.week_start_date,
         b.day_of_week,
         b.block_type,
         b.start_time,
         b.end_time
       FROM supervised_availability_confirmations c
       JOIN supervised_availability_blocks b ON b.confirmation_id = c.id
       ${skillJoin}
       JOIN users u ON u.id = c.provider_id
       WHERE c.agency_id = ?
         AND c.confirmed_at IS NOT NULL
         AND b.week_start_date = ?
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [...skillParams, agencyId, weekStartDate]
    );

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
    const supervisedByProvider = new Map();
    for (const r of supervisedRows || []) {
      const pid = Number(r.provider_id);
      if (!supervisedByProvider.has(pid)) {
        supervisedByProvider.set(pid, {
          providerId: pid,
          providerName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          confirmedAt: r.confirmed_at,
          cycleStartDate: String(r.cycle_start_date || '').slice(0, 10),
          cycleEndDate: String(r.cycle_end_date || '').slice(0, 10),
          weekStartDate: String(r.week_start_date || '').slice(0, 10),
          blocks: []
        });
      }
      supervisedByProvider.get(pid).blocks.push({
        dayOfWeek: r.day_of_week,
        blockType: r.block_type,
        startTime: String(r.start_time || '').slice(0, 5),
        endTime: String(r.end_time || '').slice(0, 5)
      });
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
      supervisedAvailability: Array.from(supervisedByProvider.values()),
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
        requestedStartAt: r.requested_start_at,
        requestedEndAt: r.requested_end_at,
        clientName: r.client_name,
        clientEmail: r.client_email,
        clientPhone: r.client_phone,
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
      const ok = await PublicAppointmentRequest.setStatus({ agencyId, requestId, status });
      if (!ok) return res.status(404).json({ error: { message: 'Request not found' } });
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

