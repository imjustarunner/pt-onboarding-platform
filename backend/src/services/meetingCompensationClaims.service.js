/**
 * Auto time claims for Huddle / Admin Meeting / Town Hall compensation.
 *
 * - Huddle host → Individual Meeting
 * - Huddle attendees → MEETING
 * - Admin Meeting / Town Hall participants (host + attendees) → MEETING
 * - Supervisors on Admin Meetings → Admin Time (admin compensation rate)
 * - admin / super_admin / support: only if they have MEETING (or Admin Time) rate > 0
 */
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import AgencyMeetingAttendanceRollup from '../models/AgencyMeetingAttendanceRollup.model.js';
import ProviderScheduleEventAttendee from '../models/ProviderScheduleEventAttendee.model.js';
import { computeSubmissionWindow } from '../utils/payrollSubmissionWindow.js';
import pool from '../config/database.js';

export const COMP_CLAIM_SOURCE = 'meeting_compensation_auto';
export const HUDDLE_HOST_SERVICE_CODE = 'Individual Meeting';
export const MEETING_SERVICE_CODE = 'MEETING';
export const ADMIN_TIME_SERVICE_CODE = 'Admin Time';
export const ADMIN_SALARY_ROLES = new Set(['admin', 'super_admin', 'superadmin', 'support']);

function wallPartsFromMysqlDateTime(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const mo = raw.getMonth() + 1;
    const d = raw.getDate();
    const h = raw.getHours();
    const mi = raw.getMinutes();
    const se = raw.getSeconds();
    return {
      ymd: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      hm: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
      date: new Date(y, mo - 1, d, h, mi, se)
    };
  }
  const s = String(raw || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  return {
    ymd: `${m[1]}-${m[2]}-${m[3]}`,
    hm: `${m[4]}:${m[5]}`,
    date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0))
  };
}

function minutesBetweenMysql(startAt, endAt) {
  const a = wallPartsFromMysqlDateTime(startAt);
  const b = wallPartsFromMysqlDateTime(endAt);
  if (!a || !b) return 0;
  const mins = Math.round((b.date.getTime() - a.date.getTime()) / 60000);
  return Number.isFinite(mins) && mins > 0 ? mins : 0;
}

function resolveClaimDate(event) {
  if (Number(event?.all_day || 0) === 1) {
    const ymd = String(event?.start_date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  }
  const parts = wallPartsFromMysqlDateTime(event?.start_at);
  return parts?.ymd || null;
}

function buildPlatformLabel(event) {
  if (String(event?.google_meet_link || '').trim()) return 'Google Meet';
  if (Number(event?.platform_video_link || 0) === 1 || event?.platform_video_link === true) return 'Platform video';
  return 'In-person / other';
}

export function normalizeMeetingSubtype(value) {
  const subtype = String(value || 'general').trim().toLowerCase();
  if (subtype === 'admin' || subtype === 'town_hall' || subtype === 'evaluation') return subtype;
  return 'general';
}

export function isCompensationClaimMeeting(event) {
  const kind = String(event?.kind || '').trim().toUpperCase();
  if (kind === 'HUDDLE') return true;
  if (kind !== 'TEAM_MEETING') return false;
  const subtype = normalizeMeetingSubtype(event?.meeting_subtype ?? event?.meetingSubtype);
  return subtype === 'admin' || subtype === 'town_hall' || subtype === 'evaluation';
}

export function meetingTypeLabelForEvent(event) {
  const kind = String(event?.kind || '').trim().toUpperCase();
  if (kind === 'HUDDLE') return 'Huddle';
  const subtype = normalizeMeetingSubtype(event?.meeting_subtype ?? event?.meetingSubtype);
  if (subtype === 'admin') return 'Admin Meeting';
  if (subtype === 'town_hall') return 'Town Hall';
  if (subtype === 'evaluation') return 'Employee Evaluation';
  return 'Team Meeting';
}

function eventHasEnded(event) {
  if (Number(event?.all_day || 0) === 1) {
    const endYmd = String(event?.end_date || event?.start_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) return false;
    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return endYmd <= todayYmd;
  }
  const endParts = wallPartsFromMysqlDateTime(event?.end_at);
  if (!endParts) return false;
  return Date.now() >= endParts.date.getTime();
}

async function loadEvent(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return null;
  const [rows] = await pool.execute(
    `SELECT pse.*, u.role AS host_role
     FROM provider_schedule_events pse
     LEFT JOIN users u ON u.id = pse.provider_id
     WHERE pse.id = ?
     LIMIT 1`,
    [eid]
  );
  return rows?.[0] || null;
}

async function loadUserRole(userId) {
  const uid = Number(userId || 0);
  if (!uid) return '';
  const [rows] = await pool.execute(
    `SELECT role FROM users WHERE id = ? LIMIT 1`,
    [uid]
  );
  return String(rows?.[0]?.role || '').trim().toLowerCase();
}

async function loadUserIsSupervisor(userId) {
  const uid = Number(userId || 0);
  if (!uid) return false;
  const [rows] = await pool.execute(
    `SELECT has_supervisor_privileges, role FROM users WHERE id = ? LIMIT 1`,
    [uid]
  );
  const u = rows?.[0] || {};
  if (u.has_supervisor_privileges === 1 || u.has_supervisor_privileges === true || u.has_supervisor_privileges === '1') {
    return true;
  }
  return String(u.role || '').trim().toLowerCase() === 'supervisor';
}

async function hasUsableRate({ agencyId, userId, serviceCode, asOf }) {
  try {
    const best = await PayrollRate.findBestRate({
      agencyId: Number(agencyId),
      userId: Number(userId),
      serviceCode: String(serviceCode || '').trim(),
      asOf: asOf || null
    });
    return Number(best?.rate_amount ?? best?.rate ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function findSubmittedCompensationClaim({
  agencyId,
  userId,
  scheduleEventId,
  serviceCode
}) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  const eid = Number(scheduleEventId || 0);
  const code = String(serviceCode || '').trim();
  if (!aid || !uid || !eid || !code) return null;
  const [rows] = await pool.execute(
    `SELECT *
     FROM payroll_time_claims
     WHERE agency_id = ?
       AND user_id = ?
       AND claim_type = 'meeting_training'
       AND status = 'submitted'
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.scheduleEventId')) AS UNSIGNED) = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.source')) = ?
       AND UPPER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.serviceCode')), ''))) = UPPER(?)
     ORDER BY id DESC
     LIMIT 1`,
    [aid, uid, eid, COMP_CLAIM_SOURCE, code]
  );
  const row = rows?.[0] || null;
  if (!row) return null;
  return PayrollTimeClaim.findById(row.id);
}

function buildPayload({
  event,
  meetingType,
  serviceCode,
  payRateSource,
  totalMinutes,
  categoryLabel = null,
  compensationNote = null
}) {
  const title = String(event?.title || meetingType).trim() || meetingType;
  const startParts = wallPartsFromMysqlDateTime(event?.start_at);
  const endParts = wallPartsFromMysqlDateTime(event?.end_at);
  return {
    meetingType,
    platform: buildPlatformLabel(event),
    summary: `${meetingType}: ${title}`,
    serviceCode,
    payRateSource,
    scheduleEventId: Number(event?.id || 0) || null,
    attestation: true,
    source: COMP_CLAIM_SOURCE,
    totalMinutes: Math.max(1, Math.round(Number(totalMinutes) || 0)),
    ...(categoryLabel ? { categoryLabel } : {}),
    ...(compensationNote ? { compensationNote } : {}),
    ...(startParts?.hm ? { startTime: startParts.hm } : {}),
    ...(endParts?.hm ? { endTime: endParts.hm } : {})
  };
}

async function upsertClaim({
  agencyId,
  userId,
  actorUserId,
  claimDate,
  payload
}) {
  const existing = await findSubmittedCompensationClaim({
    agencyId,
    userId,
    scheduleEventId: payload.scheduleEventId,
    serviceCode: payload.serviceCode
  });

  const win = await computeSubmissionWindow({
    agencyId,
    effectiveDateYmd: claimDate,
    submittedAt: new Date(),
    timeZone: 'America/Denver',
    hardStopPolicy: '60_days'
  });
  if (!win?.ok) {
    return { ok: false, skipped: true, error: win?.errorMessage || 'outside submission window' };
  }

  if (existing?.id) {
    await PayrollTimeClaim.resubmit({
      id: existing.id,
      claimDate,
      payload
    });
    return { ok: true, claimId: Number(existing.id), updated: true, userId };
  }

  const claim = await PayrollTimeClaim.create({
    agencyId,
    userId,
    submittedByUserId: Number(actorUserId || userId) || userId,
    status: 'submitted',
    claimType: 'meeting_training',
    claimDate,
    payload,
    suggestedPayrollPeriodId: win.suggestedPayrollPeriodId || null
  });
  return { ok: true, claimId: Number(claim?.id || 0) || null, created: true, userId };
}

/**
 * Sync compensation time claims for one Huddle / Admin Meeting / Town Hall event.
 */
export async function syncCompensationClaimsForEvent({
  eventId = null,
  event = null,
  actorUserId = null,
  allowScheduledFallback = true
} = {}) {
  try {
    const row = event || (eventId ? await loadEvent(eventId) : null);
    if (!row) return { ok: false, skipped: true, error: 'event_not_found', results: [] };
    if (String(row.status || 'ACTIVE').trim().toUpperCase() === 'CANCELLED') {
      return { ok: true, skipped: true, error: 'cancelled', results: [] };
    }
    if (!isCompensationClaimMeeting(row)) {
      return { ok: true, skipped: true, error: 'not_compensation_meeting', results: [] };
    }

    const agencyId = Number(row.agency_id || 0);
    const hostId = Number(row.provider_id || 0);
    const eid = Number(row.id || 0);
    if (!agencyId || !hostId || !eid) {
      return { ok: false, skipped: true, error: 'missing event/agency/provider', results: [] };
    }

    const claimDate = resolveClaimDate(row);
    if (!claimDate) return { ok: false, skipped: true, error: 'missing claim date', results: [] };

    const kind = String(row.kind || '').trim().toUpperCase();
    const meetingType = meetingTypeLabelForEvent(row);
    const scheduledMinutes = Number(row.all_day || 0) === 1
      ? 60
      : minutesBetweenMysql(row.start_at, row.end_at);
    const meetingEnded = eventHasEnded(row) || !!row.meeting_completed_at;

    // Prefer live segment rebuild when available.
    let hasSegments = false;
    try {
      const [segRows] = await pool.execute(
        `SELECT 1 FROM provider_schedule_event_attendance_segments WHERE event_id = ? LIMIT 1`,
        [eid]
      );
      hasSegments = !!(segRows && segRows.length);
      if (hasSegments) {
        const { rebuildAttendanceRollupsFromSegments } = await import('./meetingAttendanceSegments.service.js');
        await rebuildAttendanceRollupsFromSegments(eid, { syncClaims: false });
      }
    } catch { /* segments table may not exist yet */ }

    const attendanceRows = await AgencyMeetingAttendanceRollup.listForEvent(eid);
    const minutesByUser = new Map();
    for (const r of attendanceRows || []) {
      const uid = Number(r?.user_id || 0);
      if (!uid) continue;
      const mins = Math.round((Number(r?.total_seconds || 0) / 60) * 100) / 100;
      if (mins >= 0.5) minutesByUser.set(uid, mins);
    }

    const attendeeIds = await ProviderScheduleEventAttendee.listUserIdsByEventId(eid);
    const participantIds = new Set([hostId]);
    for (const id of attendeeIds || []) {
      const n = Number(id || 0);
      if (n > 0) participantIds.add(n);
    }
    for (const uid of minutesByUser.keys()) participantIds.add(uid);

    // Once segments exist (or meeting completed), never fall back to full scheduled duration.
    const useScheduledFallback = allowScheduledFallback && !hasSegments && !row.meeting_completed_at;
    if (!minutesByUser.size && !(useScheduledFallback && meetingEnded && scheduledMinutes >= 1)) {
      return { ok: true, skipped: true, error: 'waiting_for_attendance_or_end', results: [] };
    }

    const meetingSubtype = normalizeMeetingSubtype(row.meeting_subtype ?? row.meetingSubtype);
    const results = [];
    for (const uid of participantIds) {
      const isHost = uid === hostId;
      let serviceCode = MEETING_SERVICE_CODE;
      let payRateSource = 'meeting';
      let categoryLabel = null;
      let compensationNote = null;
      if (kind === 'HUDDLE' && isHost) {
        serviceCode = HUDDLE_HOST_SERVICE_CODE;
        payRateSource = 'individual_meeting';
      }

      const role = uid === hostId
        ? String(row.host_role || '').trim().toLowerCase()
        : await loadUserRole(uid);

      // Supervisors present in Admin Meetings are paid at Admin Time (not MEETING).
      if (kind === 'TEAM_MEETING' && meetingSubtype === 'admin') {
        const isSupervisor = await loadUserIsSupervisor(uid);
        if (isSupervisor) {
          serviceCode = ADMIN_TIME_SERVICE_CODE;
          payRateSource = 'admin_time';
          categoryLabel = 'Admin Meeting (Supervisor)';
          compensationNote = 'Supervisor Admin Meeting attendance is compensated at the Admin Time rate on the compensation schedule.';
        }
      }

      const mins = minutesByUser.has(uid)
        ? Number(minutesByUser.get(uid))
        : (useScheduledFallback && meetingEnded ? scheduledMinutes : 0);
      if (!(mins >= 0.5)) {
        results.push({ userId: uid, ok: false, skipped: true, error: 'no_minutes' });
        continue;
      }

      // Admin/support/superadmin: require usable rate for the code they will be paid under.
      if (ADMIN_SALARY_ROLES.has(role)) {
        const gateCode = serviceCode === HUDDLE_HOST_SERVICE_CODE || serviceCode === ADMIN_TIME_SERVICE_CODE
          ? serviceCode
          : MEETING_SERVICE_CODE;
        const okRate = await hasUsableRate({
          agencyId,
          userId: uid,
          serviceCode: gateCode,
          asOf: claimDate
        });
        if (!okRate) {
          results.push({ userId: uid, ok: true, skipped: true, error: 'no_meeting_rate_for_admin' });
          continue;
        }
      } else {
        const okRate = await hasUsableRate({
          agencyId,
          userId: uid,
          serviceCode,
          asOf: claimDate
        });
        if (!okRate) {
          results.push({ userId: uid, ok: true, skipped: true, error: 'no_usable_rate' });
          continue;
        }
      }

      const payload = buildPayload({
        event: row,
        meetingType,
        serviceCode,
        payRateSource,
        totalMinutes: mins,
        categoryLabel,
        compensationNote
      });
      // eslint-disable-next-line no-await-in-loop
      const res = await upsertClaim({
        agencyId,
        userId: uid,
        actorUserId,
        claimDate,
        payload
      });
      results.push(res);
    }

    return {
      ok: true,
      eventId: eid,
      results,
      created: results.filter((r) => r.created).length,
      updated: results.filter((r) => r.updated).length,
      skipped: results.filter((r) => r.skipped).length
    };
  } catch (e) {
    console.warn('[meetingCompensationClaims] sync failed', e?.message || e);
    return { ok: false, error: e?.message || 'sync failed', results: [] };
  }
}

/**
 * Sync compensation claims for all eligible meetings in an agency window.
 */
export async function syncCompensationClaimsForAgencyInWindow(agencyId, periodStart, periodEnd) {
  const aid = Number(agencyId || 0);
  const start = String(periodStart || '').slice(0, 10);
  const end = String(periodEnd || '').slice(0, 10);
  if (!aid || !start || !end) {
    return { ok: false, reason: 'invalid_params', eventsProcessed: 0, claimsTouched: 0 };
  }

  const [rows] = await pool.execute(
    `SELECT id
     FROM provider_schedule_events
     WHERE agency_id = ?
       AND UPPER(COALESCE(status, 'ACTIVE')) <> 'CANCELLED'
       AND (
         UPPER(COALESCE(kind, '')) = 'HUDDLE'
         OR (
           UPPER(COALESCE(kind, '')) = 'TEAM_MEETING'
           AND LOWER(COALESCE(meeting_subtype, 'general')) IN ('admin', 'town_hall', 'evaluation')
         )
       )
       AND (
         (start_at IS NOT NULL AND start_at >= ? AND start_at < DATE_ADD(?, INTERVAL 1 DAY))
         OR (all_day = 1 AND start_date IS NOT NULL AND start_date >= ? AND start_date <= ?)
       )
     ORDER BY COALESCE(start_at, start_date) ASC`,
    [aid, start, end, start, end]
  );

  let claimsTouched = 0;
  const results = [];
  for (const r of rows || []) {
    // eslint-disable-next-line no-await-in-loop
    const res = await syncCompensationClaimsForEvent({ eventId: r.id, allowScheduledFallback: true });
    results.push({ eventId: r.id, ...res });
    claimsTouched += Number(res?.created || 0) + Number(res?.updated || 0);
  }

  return {
    ok: true,
    eventsProcessed: (rows || []).length,
    claimsTouched,
    results
  };
}
