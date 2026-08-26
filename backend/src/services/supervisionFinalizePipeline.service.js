/**
 * Side effects when a supervision session is finalized:
 * - Credit supervisee individual/group hours (attendance-based)
 * - Create supervisor additional-time (indirect_time) claim for Supervision
 * - Best-effort transcript pull + AI summary
 */

import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import PayrollIndirectServiceType from '../models/PayrollIndirectServiceType.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import SupervisionSessionArtifact from '../models/SupervisionSessionArtifact.model.js';
import { computeSubmissionWindow } from '../utils/payrollSubmissionWindow.js';
import { recomputeSupervisionAccountForUser } from './supervision.service.js';
import { fetchMeetTranscriptForSession } from './googleMeetTranscript.service.js';
import { triggerSupervisionSummaryFromTranscript } from './supervisionTranscriptSummary.service.js';
import {
  normalizeSupervisionStartDateYmd,
  sessionHoursAreCountable
} from '../utils/supervisionHoursGate.util.js';

export const SUPERVISION_INDIRECT_TYPE_KEY = 'supervision';
export const SUPERVISION_INDIRECT_LABEL = 'Supervision';

function clampHours(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.round(x * 100) / 100);
}

function mysqlDateYmd(raw) {
  if (!raw) return null;
  // Session start_at is stored UTC — use UTC calendar day for claim_date / window checks.
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

function scheduledMinutes(session) {
  const start = session?.start_at ? new Date(session.start_at) : null;
  const end = session?.end_at ? new Date(session.end_at) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  return Number.isFinite(mins) && mins > 0 ? mins : 0;
}

function wallHm(raw) {
  const s = String(raw || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  return m ? `${m[4]}:${m[5]}` : null;
}

function isGroupSessionType(sessionType) {
  return String(sessionType || '').trim().toLowerCase() === 'group';
}

async function resolveSuperviseeUserIds(session) {
  const ids = new Set();
  const primary = Number(session?.supervisee_user_id || 0);
  if (primary > 0) ids.add(primary);
  try {
    const attendees = await SupervisionSession.listAttendees(session.id);
    for (const a of attendees || []) {
      const role = String(a?.participant_role || '').trim().toLowerCase();
      const uid = Number(a?.user_id || 0);
      if (uid > 0 && role === 'supervisee') ids.add(uid);
    }
  } catch {
    /* ignore */
  }
  const supervisorId = Number(session?.supervisor_user_id || 0);
  if (supervisorId > 0) ids.delete(supervisorId);
  return Array.from(ids);
}

async function ensureSupervisionServiceType(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;
  await PayrollIndirectServiceType.ensureDefaults(aid);
  const types = await PayrollIndirectServiceType.listForAgency({ agencyId: aid, activeOnly: true });
  let found = (types || []).find((t) => String(t.typeKey || '') === SUPERVISION_INDIRECT_TYPE_KEY);
  if (found) return found;
  // Agency may have customized defaults before this type existed — create it.
  try {
    found = await PayrollIndirectServiceType.create({
      agencyId: aid,
      typeKey: SUPERVISION_INDIRECT_TYPE_KEY,
      label: SUPERVISION_INDIRECT_LABEL,
      description: 'Supervision meeting time',
      iconKey: 'users',
      payBucket: 'indirect',
      sortOrder: 15,
      isActive: true
    });
  } catch {
    const retry = await PayrollIndirectServiceType.listForAgency({ agencyId: aid, activeOnly: false });
    found = (retry || []).find((t) => String(t.typeKey || '') === SUPERVISION_INDIRECT_TYPE_KEY) || null;
  }
  return found;
}

/** Payroll period entries + prelicensed baseline — excludes session-finalize credits. */
async function readHoursBaselineWithoutSessionCredits(agencyId, userId) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  if (!aid || !uid) return 0;

  let total = 0;
  try {
    const [periodRows] = await pool.execute(
      `SELECT
         COALESCE(SUM(individual_hours), 0) + COALESCE(SUM(group_hours), 0) AS total_hours
       FROM supervision_period_entries
       WHERE agency_id = ? AND user_id = ?`,
      [aid, uid]
    );
    total = clampHours(periodRows?.[0]?.total_hours || 0);
  } catch {
    total = 0;
  }

  try {
    const [uaRows] = await pool.execute(
      `SELECT supervision_is_prelicensed, supervision_start_individual_hours, supervision_start_group_hours
       FROM user_agencies
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [aid, uid]
    );
    const ua = uaRows?.[0] || null;
    const isPre = ua?.supervision_is_prelicensed === 1
      || ua?.supervision_is_prelicensed === true
      || String(ua?.supervision_is_prelicensed || '') === '1';
    if (isPre) {
      total = clampHours(
        total
        + Number(ua?.supervision_start_individual_hours || 0)
        + Number(ua?.supervision_start_group_hours || 0)
      );
    }
  } catch {
    /* ignore */
  }

  return total;
}

/** Sum credited hours from finalized sessions strictly before this one (chronological running total). */
async function readCreditedHoursFromEarlierSessions({
  agencyId,
  userId,
  sessionId,
  sessionStartAt
} = {}) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  const sid = Number(sessionId || 0);
  if (!aid || !uid || !sid || !sessionStartAt) return 0;

  try {
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(c.individual_hours + c.group_hours), 0) AS credited
       FROM supervision_session_hour_credits c
       INNER JOIN supervision_sessions ss ON ss.id = c.session_id
       WHERE c.agency_id = ?
         AND c.user_id = ?
         AND (
           ss.start_at < ?
           OR (ss.start_at = ? AND c.session_id < ?)
         )`,
      [aid, uid, sessionStartAt, sessionStartAt, sid]
    );
    return clampHours(rows?.[0]?.credited || 0);
  } catch {
    return 0;
  }
}

/**
 * S8: create supervision time claims only when the user is hourly OR has a
 * positive compensation rate for one of the given service codes.
 */
export async function userEligibleForSupervisionTimeClaim({
  agencyId,
  userId,
  serviceCodes = [],
  asOf = null
} = {}) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  if (!aid || !uid) return { ok: false, eligible: false, reason: 'missing_ids' };

  try {
    const [hwRows] = await pool.execute(
      'SELECT is_hourly_worker FROM users WHERE id = ? LIMIT 1',
      [uid]
    );
    const hw = hwRows?.[0]?.is_hourly_worker;
    const isHourly = hw === 1 || hw === true || hw === '1';
    if (isHourly) return { ok: true, eligible: true, reason: 'hourly' };
  } catch {
    /* continue to rate check */
  }

  const codes = (Array.isArray(serviceCodes) ? serviceCodes : [])
    .map((c) => String(c || '').trim().toUpperCase())
    .filter(Boolean);
  for (const code of codes) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const rateRow = await PayrollRate.findBestRate({
        agencyId: aid,
        userId: uid,
        serviceCode: code,
        asOf: asOf ? String(asOf).slice(0, 10) : null
      });
      if (Number(rateRow?.rate_amount || 0) > 0) {
        return { ok: true, eligible: true, reason: `rate_${code}` };
      }
    } catch {
      /* keep checking */
    }
  }

  return { ok: true, eligible: false, reason: 'not_hourly_and_no_rate' };
}

async function loadSupervisionEffectiveStartDate({ agencyId, userId }) {
  try {
    const [rows] = await pool.execute(
      `SELECT supervision_start_date
       FROM user_agencies
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [agencyId, userId]
    );
    return normalizeSupervisionStartDateYmd(rows?.[0]?.supervision_start_date);
  } catch {
    return null;
  }
}

export async function creditSuperviseeHoursFromFinalizedSession({
  session,
  rollups = [],
  actorUserId = null
} = {}) {
  const sid = Number(session?.id || 0);
  const agencyId = Number(session?.agency_id || 0);
  if (!sid || !agencyId) return { ok: false, skipped: true, reason: 'missing_session' };

  const sessionType = String(session?.session_type || 'individual').trim().toLowerCase() || 'individual';
  const asGroup = isGroupSessionType(sessionType);
  const sessionDateYmd = mysqlDateYmd(session?.start_at);
  const rollupByUser = new Map(
    (rollups || []).map((r) => [Number(r.user_id || 0), Number(r.total_seconds || 0)])
  );

  const superviseeIds = await resolveSuperviseeUserIds(session);
  const touched = new Set(superviseeIds);
  // Also touch anyone who still has a credit row for this session (so stale inflated rows clear).
  try {
    const [priorCredits] = await pool.execute(
      'SELECT user_id FROM supervision_session_hour_credits WHERE session_id = ?',
      [sid]
    );
    for (const row of priorCredits || []) {
      const uid = Number(row?.user_id || 0);
      if (uid > 0) touched.add(uid);
    }
  } catch {
    /* table may not exist yet */
  }

  const credited = [];
  const cleared = [];
  const loggedUncounted = [];

  for (const userId of touched) {
    const totalSecondsRaw = Math.max(0, Number(rollupByUser.get(userId) || 0));
    // Cap at 8h so a prior open-segment bug cannot permanently inflate requirement totals.
    const totalSeconds = Math.min(totalSecondsRaw, 8 * 3600);
    const hoursAttended = clampHours(totalSeconds / 3600);

    if (!(hoursAttended > 0)) {
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(
        'DELETE FROM supervision_session_hour_credits WHERE session_id = ? AND user_id = ?',
        [sid, userId]
      );
      // eslint-disable-next-line no-await-in-loop
      await recomputeSupervisionAccountForUser({ agencyId, userId });
      cleared.push(userId);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const effectiveStartDate = await loadSupervisionEffectiveStartDate({ agencyId, userId });
    const countable = sessionHoursAreCountable({ sessionDateYmd, effectiveStartDate });
    const hours = countable ? hoursAttended : 0;
    const individualHours = asGroup ? 0 : hours;
    const groupHours = asGroup ? hours : 0;

    // Snapshot running total: baseline + earlier session credits → this session → after.
    // eslint-disable-next-line no-await-in-loop
    const baselineHours = await readHoursBaselineWithoutSessionCredits(agencyId, userId);
    // eslint-disable-next-line no-await-in-loop
    const earlierSessionCredits = await readCreditedHoursFromEarlierSessions({
      agencyId,
      userId,
      sessionId: sid,
      sessionStartAt: session?.start_at
    });
    const hoursBefore = clampHours(baselineHours + earlierSessionCredits);
    const hoursAfter = clampHours(hoursBefore + hours);

    // Always persist a row (logged). Countable hours are 0 before effective date.
    // eslint-disable-next-line no-await-in-loop
    await pool.execute(
      `INSERT INTO supervision_session_hour_credits
         (agency_id, session_id, user_id, individual_hours, group_hours, total_seconds, session_type, source_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         individual_hours = VALUES(individual_hours),
         group_hours = VALUES(group_hours),
         total_seconds = VALUES(total_seconds),
         session_type = VALUES(session_type),
         source_json = VALUES(source_json),
         created_by_user_id = VALUES(created_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        sid,
        userId,
        individualHours,
        groupHours,
        totalSeconds,
        sessionType,
        JSON.stringify({
          source: 'session_finalize',
          sessionId: sid,
          sessionType,
          sessionDate: sessionDateYmd,
          effectiveStartDate,
          countable,
          totalSeconds,
          hoursBefore,
          hoursAttended,
          hoursCounted: hours,
          hoursAfter
        }),
        actorUserId ? Number(actorUserId) : null
      ]
    );
    // eslint-disable-next-line no-await-in-loop
    await recomputeSupervisionAccountForUser({ agencyId, userId });
    const row = {
      userId,
      individualHours,
      groupHours,
      totalSeconds,
      hoursBefore,
      hoursAttended,
      hoursAfter,
      countable,
      effectiveStartDate
    };
    if (countable) credited.push(row);
    else loggedUncounted.push(row);
  }

  return { ok: true, credited, cleared, loggedUncounted };
}

/** Re-apply hour credits for all finalized sessions a user attended (e.g. after effective date set). */
export async function resyncFinalizedSessionHourCreditsForUser({
  agencyId,
  userId,
  actorUserId = null
} = {}) {
  const aId = Number(agencyId || 0);
  const uid = Number(userId || 0);
  if (!aId || !uid) return { ok: false, reason: 'missing_ids', resynced: 0 };

  let sessionIds = [];
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT ss.id, ss.start_at
       FROM supervision_sessions ss
       LEFT JOIN supervision_session_attendees ssa
         ON ssa.session_id = ss.id AND ssa.user_id = ?
       LEFT JOIN supervision_session_attendance_rollups ssar
         ON ssar.session_id = ss.id AND ssar.user_id = ?
       WHERE ss.agency_id = ?
         AND UPPER(TRIM(COALESCE(ss.status, ''))) = 'FINALIZED'
         AND (
           ssa.user_id IS NOT NULL
           OR ssar.user_id IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM supervision_session_hour_credits c
             WHERE c.session_id = ss.id AND c.user_id = ?
           )
         )
       ORDER BY ss.start_at ASC, ss.id ASC`,
      [uid, uid, aId, uid]
    );
    sessionIds = (rows || []).map((r) => Number(r.id)).filter((n) => n > 0);
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return { ok: true, resynced: 0 };
    throw e;
  }

  let resynced = 0;
  for (const sessionId of sessionIds) {
    // eslint-disable-next-line no-await-in-loop
    const result = await resyncFinalizedSessionHourCredits({ sessionId, actorUserId });
    if (result?.ok && !result?.skipped) resynced += 1;
  }
  await recomputeSupervisionAccountForUser({ agencyId: aId, userId: uid });
  return { ok: true, resynced, sessionCount: sessionIds.length };
}

/**
 * Re-apply hour credits from current attendance rollups for a FINALIZED session.
 * Use after attendance repair so inflated credits are corrected in supervision_accounts.
 */
export async function resyncFinalizedSessionHourCredits({ sessionId, actorUserId = null } = {}) {
  const sid = Number(sessionId || 0);
  if (!sid) return { ok: false, skipped: true, reason: 'missing_session' };
  const session = await SupervisionSession.findById(sid);
  if (!session) return { ok: false, skipped: true, reason: 'not_found' };
  const status = String(session.status || '').trim().toUpperCase();
  if (status !== 'FINALIZED') return { ok: true, skipped: true, reason: 'not_finalized' };
  const rollups = await SupervisionSession.listAttendanceRollupsForSession(sid);
  return creditSuperviseeHoursFromFinalizedSession({
    session,
    rollups,
    actorUserId
  });
}

export async function readSessionCreditSumsForUser({ agencyId, userId } = {}) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  if (!aid || !uid) return { individual: 0, group: 0 };
  try {
    const [rows] = await pool.execute(
      `SELECT
         COALESCE(SUM(individual_hours), 0) AS individual,
         COALESCE(SUM(group_hours), 0) AS \`group\`
       FROM supervision_session_hour_credits
       WHERE agency_id = ? AND user_id = ?`,
      [aid, uid]
    );
    return {
      individual: clampHours(rows?.[0]?.individual || 0),
      group: clampHours(rows?.[0]?.group || 0)
    };
  } catch {
    return { individual: 0, group: 0 };
  }
}

/** Trim credited session hours newest-first so a track sum matches target (admin balance down). */
export async function trimSessionCreditTrackToSum({
  agencyId,
  userId,
  track = 'individual',
  targetSum = 0
} = {}) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  const col = track === 'group' ? 'group_hours' : 'individual_hours';
  const target = clampHours(targetSum);
  if (!aid || !uid) return { ok: false, trimmed: 0 };

  const [rows] = await pool.execute(
    `SELECT
       c.session_id,
       c.individual_hours,
       c.group_hours,
       c.source_json
     FROM supervision_session_hour_credits c
     INNER JOIN supervision_sessions ss ON ss.id = c.session_id
     WHERE c.agency_id = ? AND c.user_id = ?
     ORDER BY ss.start_at DESC, c.session_id DESC`,
    [aid, uid]
  );

  let currentSum = clampHours(
    (rows || []).reduce((sum, row) => sum + Number(row?.[col] || 0), 0)
  );
  if (currentSum <= target + 1e-9) {
    return { ok: true, trimmed: 0, previousSum: currentSum, nextSum: currentSum };
  }

  let excess = clampHours(currentSum - target);
  let trimmed = 0;
  for (const row of rows || []) {
    if (excess <= 1e-9) break;
    const cur = clampHours(row?.[col] || 0);
    if (cur <= 0) continue;
    const cut = clampHours(Math.min(cur, excess));
    const nextVal = clampHours(cur - cut);
    let src = row.source_json;
    if (typeof src === 'string') {
      try { src = JSON.parse(src); } catch { src = {}; }
    }
    if (!src || typeof src !== 'object') src = {};
    const nextIndividual = track === 'individual' ? nextVal : clampHours(row.individual_hours || 0);
    const nextGroup = track === 'group' ? nextVal : clampHours(row.group_hours || 0);
    const hoursCounted = clampHours(nextIndividual + nextGroup);
    // eslint-disable-next-line no-await-in-loop
    await pool.execute(
      `UPDATE supervision_session_hour_credits
       SET individual_hours = ?, group_hours = ?, source_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ? AND user_id = ? AND session_id = ?`,
      [
        nextIndividual,
        nextGroup,
        JSON.stringify({
          ...src,
          hoursCounted,
          adminTrimmed: true,
          adminTrimTrack: track,
          adminTrimAmount: cut
        }),
        aid,
        uid,
        Number(row.session_id)
      ]
    );
    excess = clampHours(excess - cut);
    trimmed = clampHours(trimmed + cut);
    currentSum = clampHours(currentSum - cut);
  }

  return { ok: true, trimmed, previousSum: clampHours(currentSum + trimmed), nextSum: currentSum };
}

/** Recompute Before/Attended/After snapshots on every session credit row (chronological chain). */
export async function rebuildSessionHourCreditSnapshotsForUser({ agencyId, userId } = {}) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  if (!aid || !uid) return { ok: false, updated: 0 };

  const baselineHours = await readHoursBaselineWithoutSessionCredits(aid, uid);
  const [rows] = await pool.execute(
    `SELECT
       c.session_id,
       c.individual_hours,
       c.group_hours,
       c.source_json,
       ss.start_at
     FROM supervision_session_hour_credits c
     INNER JOIN supervision_sessions ss ON ss.id = c.session_id
     WHERE c.agency_id = ? AND c.user_id = ?
     ORDER BY ss.start_at ASC, c.session_id ASC`,
    [aid, uid]
  );

  let running = baselineHours;
  let updated = 0;
  for (const row of rows || []) {
    let src = row.source_json;
    if (typeof src === 'string') {
      try { src = JSON.parse(src); } catch { src = {}; }
    }
    if (!src || typeof src !== 'object') src = {};
    const hoursCounted = clampHours(
      Number(row.individual_hours || 0) + Number(row.group_hours || 0)
    );
    const hoursAttended = Number.isFinite(Number(src.hoursAttended))
      ? clampHours(src.hoursAttended)
      : hoursCounted;
    const hoursBefore = running;
    const hoursAfter = clampHours(hoursBefore + hoursCounted);
    // eslint-disable-next-line no-await-in-loop
    await pool.execute(
      `UPDATE supervision_session_hour_credits
       SET source_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ? AND user_id = ? AND session_id = ?`,
      [
        JSON.stringify({
          ...src,
          hoursBefore,
          hoursAttended,
          hoursCounted,
          hoursAfter
        }),
        aid,
        uid,
        Number(row.session_id)
      ]
    );
    running = hoursAfter;
    updated += 1;
  }

  return { ok: true, updated, finalTotal: running };
}

async function findExistingSupervisorClaimForSession(executor, {
  agencyId,
  supervisorId,
  sessionId,
  linkedClaimId = 0
} = {}) {
  const aId = Number(agencyId || 0);
  const uid = Number(supervisorId || 0);
  const sid = Number(sessionId || 0);
  if (!aId || !uid || !sid) return 0;

  const linkedId = Number(linkedClaimId || 0);
  if (linkedId > 0) {
    const existing = await PayrollTimeClaim.findById(linkedId);
    const st = String(existing?.status || '').toLowerCase();
    if (existing && st && st !== 'withdrawn' && st !== 'rejected') {
      return linkedId;
    }
  }

  const noteLike = `Supervision session #${sid} (%`;
  const [dupRows] = await executor.execute(
    `SELECT id
     FROM payroll_time_claims
     WHERE agency_id = ?
       AND user_id = ?
       AND claim_type = 'indirect_time'
       AND status IN ('submitted', 'needs_changes', 'approved', 'deferred', 'paid')
       AND (
         CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.supervisionSessionId')) AS UNSIGNED) = ?
         OR (
           JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.source')) = 'supervision_session_finalize'
           AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.allocations[0].note')) LIKE ?
         )
       )
     ORDER BY id DESC
     LIMIT 1`,
    [aId, uid, sid, noteLike]
  );
  return Number(dupRows?.[0]?.id || 0);
}

export async function createSupervisorSupervisionTimeClaim({
  session,
  rollups = [],
  actorUserId = null
} = {}) {
  const sid = Number(session?.id || 0);
  const agencyId = Number(session?.agency_id || 0);
  const supervisorId = Number(session?.supervisor_user_id || 0);
  if (!sid || !agencyId || !supervisorId) {
    return { ok: false, skipped: true, reason: 'missing_session' };
  }

  const sessionType = String(session?.session_type || 'individual').trim().toLowerCase() || 'individual';
  const supervisorCodes = sessionType === 'group' ? ['99416', '99415'] : ['99415'];
  const claimDate = mysqlDateYmd(session.start_at);
  const eligibility = await userEligibleForSupervisionTimeClaim({
    agencyId,
    userId: supervisorId,
    serviceCodes: supervisorCodes,
    asOf: claimDate
  });
  if (!eligibility.eligible) {
    console.warn(
      `[supervisionFinalize] supervisor claim skipped session=${sid} user=${supervisorId}: ${eligibility.reason || 'not_eligible_for_claim'}`
    );
    return { ok: true, skipped: true, reason: eligibility.reason || 'not_eligible_for_claim' };
  }

  const supervisorSeconds = Math.max(
    0,
    Number((rollups || []).find((r) => Number(r.user_id) === supervisorId)?.total_seconds || 0)
  );
  const minutesFromAttendance = supervisorSeconds > 0 ? Math.max(1, Math.round(supervisorSeconds / 60)) : 0;
  const minutes = minutesFromAttendance > 0 ? minutesFromAttendance : Math.max(1, scheduledMinutes(session));
  if (!(minutes >= 1)) {
    return { ok: false, skipped: true, reason: 'no_duration' };
  }

  if (!claimDate) return { ok: false, skipped: true, reason: 'missing_claim_date' };

  const serviceType = await ensureSupervisionServiceType(agencyId);
  if (!serviceType?.id) return { ok: false, skipped: true, reason: 'missing_service_type' };

  const win = await computeSubmissionWindow({
    agencyId,
    effectiveDateYmd: claimDate,
    submittedAt: new Date(),
    timeZone: 'America/Denver',
    hardStopPolicy: '60_days'
  });
  if (!win?.ok) {
    console.warn(
      `[supervisionFinalize] supervisor claim window blocked session=${sid}: ${win?.errorMessage || 'outside_submission_window'} claimDate=${claimDate}`
    );
    return { ok: false, skipped: true, reason: win?.errorMessage || 'outside_submission_window' };
  }

  const startTime = wallHm(session.start_at);
  const endTime = wallHm(session.end_at);
  const serviceCode = sessionType === 'group' ? '99416' : '99415';
  const payload = {
    entryMethod: 'manual',
    allocationMode: 'duration',
    totalMinutes: minutes,
    bucket: 'indirect',
    attestation: true,
    source: 'supervision_session_finalize',
    supervisionSessionId: sid,
    sessionType,
    serviceCode,
    allocations: [
      {
        serviceTypeId: Number(serviceType.id),
        serviceTypeKey: SUPERVISION_INDIRECT_TYPE_KEY,
        serviceTypeLabel: SUPERVISION_INDIRECT_LABEL,
        minutes,
        payBucket: 'indirect',
        sortOrder: 1,
        note: `Supervision session #${sid} (${sessionType})`,
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {})
      }
    ]
  };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [sessRows] = await conn.execute(
      `SELECT id, agency_id, supervisor_user_id, supervisor_time_claim_id, session_type, start_at, end_at
       FROM supervision_sessions
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [sid]
    );
    const lockedSession = sessRows?.[0] || null;
    if (!lockedSession) {
      await conn.rollback();
      return { ok: false, skipped: true, reason: 'missing_session' };
    }

    const dupId = await findExistingSupervisorClaimForSession(conn, {
      agencyId,
      supervisorId,
      sessionId: sid,
      linkedClaimId: Number(lockedSession.supervisor_time_claim_id || 0)
    });
    if (dupId > 0) {
      await conn.execute(
        'UPDATE supervision_sessions SET supervisor_time_claim_id = ? WHERE id = ? LIMIT 1',
        [dupId, sid]
      );
      await conn.commit();
      return { ok: true, skipped: true, claimId: dupId, reason: 'duplicate_found' };
    }

    const payloadJson = JSON.stringify(payload || {});
    const submittedBy = Number(actorUserId || supervisorId) || supervisorId;
    const [insertRes] = await conn.execute(
      `INSERT INTO payroll_time_claims
       (agency_id, user_id, submitted_by_user_id, status, claim_type, claim_date, payload_json, suggested_payroll_period_id)
       VALUES (?, ?, ?, 'submitted', 'indirect_time', ?, ?, ?)`,
      [
        agencyId,
        supervisorId,
        submittedBy,
        claimDate,
        payloadJson,
        win.suggestedPayrollPeriodId || null
      ]
    );
    const claimId = Number(insertRes?.insertId || 0);
    if (claimId > 0) {
      const hours = Math.round((minutes / 60) * 100) / 100;
      await conn.execute(
        `UPDATE payroll_time_claims
         SET bucket = 'indirect', credits_hours = ?
         WHERE id = ?
         LIMIT 1`,
        [hours, claimId]
      );
      await conn.execute(
        'UPDATE supervision_sessions SET supervisor_time_claim_id = ? WHERE id = ? LIMIT 1',
        [claimId, sid]
      );
    }
    await conn.commit();
    return { ok: true, claimId: claimId || null, created: true, minutes };
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Optional 99414 supervisee claim path — same hourly-or-rate gate as supervisor claims.
 * Currently unused by finalize (hours accrue via supervision_session_hour_credits), but
 * kept so any future/manual 99414 claim creation shares S8 eligibility rules.
 */
export async function createSuperviseeSupervisionTimeClaim({
  session,
  userId,
  rollups = [],
  actorUserId = null
} = {}) {
  const sid = Number(session?.id || 0);
  const agencyId = Number(session?.agency_id || 0);
  const superviseeId = Number(userId || session?.supervisee_user_id || 0);
  if (!sid || !agencyId || !superviseeId) {
    return { ok: false, skipped: true, reason: 'missing_session' };
  }

  const sessionType = String(session?.session_type || 'individual').trim().toLowerCase() || 'individual';
  const superviseeCodes = sessionType === 'group' ? ['99416', '99414'] : ['99414'];
  const claimDate = mysqlDateYmd(session.start_at);
  const eligibility = await userEligibleForSupervisionTimeClaim({
    agencyId,
    userId: superviseeId,
    serviceCodes: superviseeCodes,
    asOf: claimDate
  });
  if (!eligibility.eligible) {
    return { ok: true, skipped: true, reason: eligibility.reason || 'not_eligible_for_claim' };
  }

  // No automatic claim creation yet — eligibility gate only.
  return {
    ok: true,
    skipped: true,
    reason: 'supervisee_claim_not_auto_created',
    eligible: true,
    eligibilityReason: eligibility.reason,
    rollupSeconds: Number((rollups || []).find((r) => Number(r.user_id) === superviseeId)?.total_seconds || 0),
    actorUserId: actorUserId ? Number(actorUserId) : null
  };
}

export async function maybePullTranscriptAndSummarize({ session, actorUserId = null } = {}) {
  const sid = Number(session?.id || 0);
  if (!sid) return { ok: false, skipped: true };

  let artifact = await SupervisionSessionArtifact.findBySessionId(sid);
  const hasSummary = !!String(artifact?.summary_text || '').trim();
  let hasTranscript =
    !!String(artifact?.transcript_text || '').trim() ||
    !!String(artifact?.transcript_url || '').trim();

  // Best-effort Google Meet transcript pull when nothing is stored yet.
  if (!hasTranscript) {
    const canAttempt =
      !!String(session?.google_meet_link || '').trim() ||
      !!String(session?.google_event_id || '').trim();
    if (canAttempt) {
      try {
        const auto = await fetchMeetTranscriptForSession({
          hostEmail: session.google_host_email,
          meetLink: session.google_meet_link,
          googleEventId: session.google_event_id,
          sessionStartAt: session.start_at
        });
        if (auto?.ok && (String(auto.transcriptUrl || '').trim() || String(auto.transcriptText || '').trim())) {
          artifact = await SupervisionSessionArtifact.upsertBySessionId({
            sessionId: sid,
            transcriptUrl: auto.transcriptUrl || null,
            transcriptText: auto.transcriptText || null,
            updatedByUserId: actorUserId ? Number(actorUserId) : null
          });
          hasTranscript = true;
        }
      } catch (e) {
        console.warn('[supervisionFinalize] meet transcript pull failed', e?.message || e);
      }
    }
  }

  if (!hasTranscript) {
    return { ok: true, skipped: true, reason: 'no_transcript' };
  }
  if (hasSummary) {
    return { ok: true, skipped: true, reason: 'summary_exists' };
  }

  const summary = await triggerSupervisionSummaryFromTranscript(sid).catch((e) => {
    console.warn('[supervisionFinalize] AI summary failed', e?.message || e);
    return { ok: false };
  });
  return { ok: !!summary?.ok, summarized: !!summary?.ok };
}

export async function reverseSupervisionFinalizeSideEffects({ session } = {}) {
  const sid = Number(session?.id || 0);
  const agencyId = Number(session?.agency_id || 0);
  if (!sid) return { ok: false };

  const [creditRows] = await pool.execute(
    'SELECT user_id FROM supervision_session_hour_credits WHERE session_id = ?',
    [sid]
  );
  const userIds = (creditRows || []).map((r) => Number(r.user_id || 0)).filter((n) => n > 0);

  await pool.execute('DELETE FROM supervision_session_hour_credits WHERE session_id = ?', [sid]);

  for (const userId of userIds) {
    // eslint-disable-next-line no-await-in-loop
    await recomputeSupervisionAccountForUser({ agencyId, userId });
  }

  const claimId = Number(session?.supervisor_time_claim_id || 0);
  if (claimId > 0) {
    try {
      const claim = await PayrollTimeClaim.findById(claimId);
      const status = String(claim?.status || '').toLowerCase();
      if (claim && (status === 'submitted' || status === 'needs_changes')) {
        await PayrollTimeClaim.softWithdraw({ id: claimId });
      }
    } catch (e) {
      console.warn('[supervisionFinalize] withdraw claim failed', e?.message || e);
    }
  }

  await pool.execute(
    'UPDATE supervision_sessions SET supervisor_time_claim_id = NULL WHERE id = ? LIMIT 1',
    [sid]
  );

  return { ok: true, reversedUsers: userIds.length, claimId: claimId || null };
}

/**
 * Run after session status is set to FINALIZED (not MISSED).
 * Best-effort: never throws to the finalize caller.
 */
export async function runSupervisionFinalizeSideEffects({
  session,
  rollups = [],
  actorUserId = null,
  finalizeAsMissed = false
} = {}) {
  const out = {
    hours: null,
    claim: null,
    transcript: null
  };
  if (finalizeAsMissed || !session?.id) {
    return { ok: true, skipped: true, ...out };
  }

  try {
    out.hours = await creditSuperviseeHoursFromFinalizedSession({
      session,
      rollups,
      actorUserId
    });
  } catch (e) {
    console.warn('[supervisionFinalize] hour credit failed', e?.message || e);
    out.hours = { ok: false, error: e?.message || 'hour_credit_failed' };
  }

  try {
    out.claim = await createSupervisorSupervisionTimeClaim({
      session,
      rollups,
      actorUserId
    });
  } catch (e) {
    console.warn('[supervisionFinalize] supervisor claim failed', e?.message || e);
    out.claim = { ok: false, error: e?.message || 'claim_failed' };
  }

  try {
    out.transcript = await maybePullTranscriptAndSummarize({
      session,
      actorUserId
    });
  } catch (e) {
    console.warn('[supervisionFinalize] transcript/summary failed', e?.message || e);
    out.transcript = { ok: false, error: e?.message || 'transcript_failed' };
  }

  return { ok: true, ...out };
}
