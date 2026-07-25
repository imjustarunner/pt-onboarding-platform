/**
 * Side effects when a supervision session is finalized:
 * - Credit supervisee individual/group hours (attendance-based)
 * - Create supervisor additional-time (indirect_time) claim for Supervision
 * - Best-effort transcript pull + AI summary
 */

import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import PayrollIndirectServiceType from '../models/PayrollIndirectServiceType.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import SupervisionSessionArtifact from '../models/SupervisionSessionArtifact.model.js';
import { computeSubmissionWindow } from '../utils/payrollSubmissionWindow.js';
import { recomputeSupervisionAccountForUser } from './supervision.service.js';
import { fetchMeetTranscriptForSession } from './googleMeetTranscript.service.js';
import { triggerSupervisionSummaryFromTranscript } from './supervisionTranscriptSummary.service.js';

export const SUPERVISION_INDIRECT_TYPE_KEY = 'supervision';
export const SUPERVISION_INDIRECT_LABEL = 'Supervision';

function clampHours(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.round(x * 100) / 100);
}

function mysqlDateYmd(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
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
  const rollupByUser = new Map(
    (rollups || []).map((r) => [Number(r.user_id || 0), Number(r.total_seconds || 0)])
  );

  const superviseeIds = await resolveSuperviseeUserIds(session);
  const credited = [];

  for (const userId of superviseeIds) {
    const totalSeconds = Math.max(0, Number(rollupByUser.get(userId) || 0));
    if (!(totalSeconds > 0)) continue;
    const hours = clampHours(totalSeconds / 3600);
    if (!(hours > 0)) continue;
    const individualHours = asGroup ? 0 : hours;
    const groupHours = asGroup ? hours : 0;

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
          totalSeconds
        }),
        actorUserId ? Number(actorUserId) : null
      ]
    );
    // eslint-disable-next-line no-await-in-loop
    await recomputeSupervisionAccountForUser({ agencyId, userId });
    credited.push({ userId, individualHours, groupHours, totalSeconds });
  }

  return { ok: true, credited };
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

  const existingClaimId = Number(session?.supervisor_time_claim_id || 0);
  if (existingClaimId > 0) {
    const existing = await PayrollTimeClaim.findById(existingClaimId);
    if (existing && String(existing.status || '').toLowerCase() !== 'withdrawn') {
      return { ok: true, skipped: true, claimId: existingClaimId, reason: 'already_linked' };
    }
  }

  // Idempotency: find any submitted claim already tagged with this session.
  const [dupRows] = await pool.execute(
    `SELECT id
     FROM payroll_time_claims
     WHERE agency_id = ?
       AND user_id = ?
       AND claim_type = 'indirect_time'
       AND status = 'submitted'
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.supervisionSessionId')) AS UNSIGNED) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [agencyId, supervisorId, sid]
  );
  const dupId = Number(dupRows?.[0]?.id || 0);
  if (dupId > 0) {
    await pool.execute(
      'UPDATE supervision_sessions SET supervisor_time_claim_id = ? WHERE id = ? LIMIT 1',
      [dupId, sid]
    );
    return { ok: true, skipped: true, claimId: dupId, reason: 'duplicate_found' };
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

  const claimDate = mysqlDateYmd(session.start_at);
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
    return { ok: false, skipped: true, reason: win?.errorMessage || 'outside_submission_window' };
  }

  const sessionType = String(session?.session_type || 'individual').trim().toLowerCase() || 'individual';
  const startTime = wallHm(session.start_at);
  const endTime = wallHm(session.end_at);
  const payload = {
    entryMethod: 'manual',
    allocationMode: 'duration',
    totalMinutes: minutes,
    bucket: 'indirect',
    attestation: true,
    source: 'supervision_session_finalize',
    supervisionSessionId: sid,
    sessionType,
    serviceCode: sessionType === 'group' ? '99416' : '99415',
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

  const claim = await PayrollTimeClaim.create({
    agencyId,
    userId: supervisorId,
    submittedByUserId: Number(actorUserId || supervisorId) || supervisorId,
    status: 'submitted',
    claimType: 'indirect_time',
    claimDate,
    payload,
    suggestedPayrollPeriodId: win.suggestedPayrollPeriodId || null
  });

  const claimId = Number(claim?.id || 0);
  if (claimId > 0) {
    const hours = Math.round((minutes / 60) * 100) / 100;
    await pool.execute(
      `UPDATE payroll_time_claims
       SET bucket = 'indirect', credits_hours = ?
       WHERE id = ?
       LIMIT 1`,
      [hours, claimId]
    );
    await pool.execute(
      'UPDATE supervision_sessions SET supervisor_time_claim_id = ? WHERE id = ? LIMIT 1',
      [claimId, sid]
    );
  }

  return { ok: true, claimId: claimId || null, created: true, minutes };
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
