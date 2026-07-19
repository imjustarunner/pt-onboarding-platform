import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import { computeSubmissionWindow } from '../utils/payrollSubmissionWindow.js';
import pool from '../config/database.js';

export const TRAINING_PAY_ROLES = new Set(['clinical_practice_assistant', 'provider_plus']);
export const TRAINING_MEETING_TYPE = 'Training/Mentorship/Onboarding';
export const TRAINING_SERVICE_CODE = 'Admin Time';

export function isTrainingPayEligibleRole(role) {
  return TRAINING_PAY_ROLES.has(String(role || '').trim().toLowerCase());
}

function wallPartsFromMysqlDateTime(raw) {
  const s = String(raw || '').trim();
  // Accept "YYYY-MM-DD HH:MM:SS" or ISO-ish values.
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

function buildTrainingPayload(event) {
  const title = String(event?.title || 'Team meeting').trim() || 'Team meeting';
  const totalMinutes = Number(event?.all_day || 0) === 1
    ? 60
    : minutesBetweenMysql(event?.start_at, event?.end_at);
  const startParts = wallPartsFromMysqlDateTime(event?.start_at);
  const endParts = wallPartsFromMysqlDateTime(event?.end_at);
  return {
    meetingType: TRAINING_MEETING_TYPE,
    platform: buildPlatformLabel(event),
    summary: `Scheduled ${TRAINING_MEETING_TYPE} meeting: ${title}`,
    serviceCode: TRAINING_SERVICE_CODE,
    payRateSource: 'admin_time',
    scheduleEventId: Number(event?.id || 0) || null,
    attestation: true,
    source: 'schedule_event_training_flag',
    totalMinutes: totalMinutes >= 1 ? totalMinutes : 60,
    ...(startParts?.hm ? { startTime: startParts.hm } : {}),
    ...(endParts?.hm ? { endTime: endParts.hm } : {})
  };
}

export async function findSubmittedTrainingClaimForEvent({ agencyId, userId, scheduleEventId }) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  const eid = Number(scheduleEventId || 0);
  if (!aid || !uid || !eid) return null;
  const [rows] = await pool.execute(
    `SELECT *
     FROM payroll_time_claims
     WHERE agency_id = ?
       AND user_id = ?
       AND claim_type = 'meeting_training'
       AND status = 'submitted'
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.scheduleEventId')) AS UNSIGNED) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [aid, uid, eid]
  );
  const row = rows?.[0] || null;
  if (!row) return null;
  return PayrollTimeClaim.findById(row.id);
}

/**
 * Create (or refresh) a submitted Admin Time pay claim for a training-flagged meeting.
 * Best-effort: never throws to the caller — returns { ok, claimId?, skipped?, error? }.
 */
export async function syncTrainingPayClaimForEvent({
  event,
  hostRole,
  actorUserId = null,
  enabled = true
} = {}) {
  try {
    const eventId = Number(event?.id || 0);
    const agencyId = Number(event?.agency_id || 0);
    const userId = Number(event?.provider_id || 0);
    const kind = String(event?.kind || '').trim().toUpperCase();
    if (!eventId || !agencyId || !userId) {
      return { ok: false, skipped: true, error: 'missing event/agency/provider' };
    }
    if (!['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
      return { ok: false, skipped: true, error: 'not a meeting kind' };
    }

    const existing = await findSubmittedTrainingClaimForEvent({
      agencyId,
      userId,
      scheduleEventId: eventId
    });

    if (!enabled) {
      if (existing?.id) {
        await PayrollTimeClaim.softWithdraw({ id: existing.id });
        return { ok: true, withdrawn: true, claimId: Number(existing.id) };
      }
      return { ok: true, skipped: true };
    }

    if (!isTrainingPayEligibleRole(hostRole)) {
      return { ok: false, skipped: true, error: 'host role not eligible' };
    }

    const claimDate = resolveClaimDate(event);
    if (!claimDate) return { ok: false, skipped: true, error: 'missing claim date' };

    const payload = buildTrainingPayload(event);
    if (!(Number(payload.totalMinutes) >= 1)) {
      return { ok: false, skipped: true, error: 'invalid duration' };
    }

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
      return { ok: true, claimId: Number(existing.id), updated: true };
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
    return { ok: true, claimId: Number(claim?.id || 0) || null, created: true };
  } catch (e) {
    console.warn('[scheduleEventTrainingPay] sync failed', e?.message || e);
    return { ok: false, error: e?.message || 'sync failed' };
  }
}

export async function withdrawTrainingPayClaimsForEventIds({
  eventIds = [],
  providerId = null
} = {}) {
  const ids = Array.from(new Set((eventIds || []).map((n) => Number(n || 0)).filter((n) => n > 0)));
  if (!ids.length) return { withdrawn: 0 };
  const pid = Number(providerId || 0);
  let withdrawn = 0;
  for (const eid of ids) {
    try {
      const params = [eid];
      let sql = `
        SELECT id
        FROM payroll_time_claims
        WHERE claim_type = 'meeting_training'
          AND status = 'submitted'
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.scheduleEventId')) AS UNSIGNED) = ?`;
      if (pid > 0) {
        sql += ' AND user_id = ?';
        params.push(pid);
      }
      const [rows] = await pool.execute(sql, params);
      for (const row of rows || []) {
        const id = Number(row?.id || 0);
        if (!id) continue;
        // eslint-disable-next-line no-await-in-loop
        await PayrollTimeClaim.softWithdraw({ id });
        withdrawn += 1;
      }
    } catch (e) {
      console.warn('[scheduleEventTrainingPay] withdraw failed', eid, e?.message || e);
    }
  }
  return { withdrawn };
}
