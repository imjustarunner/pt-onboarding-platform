import { body, validationResult } from 'express-validator';
import User from '../models/User.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import SupervisionSessionArtifact from '../models/SupervisionSessionArtifact.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';
import { fetchMeetTranscriptForSession } from '../services/googleMeetTranscript.service.js';
import PayrollRateCard from '../models/PayrollRateCard.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import { callGeminiText } from '../services/geminiText.service.js';
import pool from '../config/database.js';

function requireValid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    return false;
  }
  return true;
}

function parseDateTimeLocalString(s) {
  // Accept "YYYY-MM-DDTHH:MM:SS" or "YYYY-MM-DD HH:MM:SS" or ISO strings.
  const raw = String(s || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    // Convert to MySQL DATETIME "YYYY-MM-DD HH:MM:SS" in local time
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  // Fall back: allow already formatted datetime
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)) return raw.replace('T', ' ');
  return null;
}

async function requireUsersInAgency({ agencyId, supervisorUserId, superviseeUserId }) {
  const supAgencies = await User.getAgencies(supervisorUserId);
  const svAgencies = await User.getAgencies(superviseeUserId);
  const aId = Number(agencyId);
  const supOk = (supAgencies || []).some((a) => Number(a?.id) === aId);
  const svOk = (svAgencies || []).some((a) => Number(a?.id) === aId);
  return { supOk, svOk };
}

async function getUsersInAgencyMap({ agencyId, userIds = [] }) {
  const aId = Number(agencyId);
  const ids = Array.from(new Set((userIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)));
  const out = {};
  if (!ids.length) return out;
  await Promise.all(ids.map(async (uid) => {
    const agencies = await User.getAgencies(uid);
    out[uid] = (agencies || []).some((a) => Number(a?.id) === aId);
  }));
  return out;
}

async function canScheduleSession(req, { agencyId, supervisorUserId, superviseeUserId }) {
  const role = String(req.user?.role || '').toLowerCase();
  const actorId = Number(req.user?.id || 0);
  const aId = Number(agencyId);

  if (role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff' || role === 'clinical_practice_assistant' || role === 'provider_plus') {
    // Must share agency with both (best-effort)
    const actorAgencies = await User.getAgencies(actorId);
    const hasAccess = (actorAgencies || []).some((a) => Number(a?.id) === aId);
    return hasAccess;
  }

  // Provider/school staff etc: allow if actor is one of the participants and belongs to this agency.
  if (actorId === Number(superviseeUserId) || actorId === Number(supervisorUserId)) {
    const actorAgencies = await User.getAgencies(actorId);
    return (actorAgencies || []).some((a) => Number(a?.id) === aId);
  }
  return false;
}

function canViewAgencySupervisionLogs(roleRaw) {
  const role = String(roleRaw || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(role);
}

function supervisionServiceCodeForParticipant({ participantRole, sessionType }) {
  const role = String(participantRole || '').trim().toLowerCase();
  const st = String(sessionType || 'individual').trim().toLowerCase();
  if (role === 'supervisor') return '99415';
  if (st === 'group' || st === 'triadic') return '99416';
  return '99414';
}

function isSupervisionMeetingCode(codeRaw) {
  const code = String(codeRaw || '').trim().toUpperCase();
  return code === '99414' || code === '99415' || code === '99416';
}

function parseAsDate(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mysqlNowDateTime() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

function canViewSessionArtifacts(roleRaw) {
  const role = String(roleRaw || '').toLowerCase();
  return [
    'super_admin',
    'admin',
    'support',
    'staff',
    'clinical_practice_assistant',
    'provider',
    'provider_plus',
    'supervisor',
    'supervisee'
  ].includes(role);
}

function buildSupervisionSummaryPrompt(transcriptText) {
  const cleaned = String(transcriptText || '').trim().slice(0, 15000);
  return [
    'You are generating a supervision meeting summary for internal documentation.',
    'Return concise markdown with these sections only:',
    '- Key updates',
    '- Clinical/operational decisions',
    '- Action items (with owner)',
    '- Risks/follow-ups',
    '',
    'Rules:',
    '- Be factual, no invented details.',
    '- Keep each section to 2-5 bullets.',
    '- If information is missing, state "Not discussed".',
    '',
    'Transcript:',
    cleaned
  ].join('\n');
}

async function recomputeAttendanceRollupForUser({ sessionId, userId }) {
  const sid = Number(sessionId || 0);
  const uid = Number(userId || 0);
  if (!sid || !uid) return null;

  const events = await SupervisionSession.listAttendanceEventsForSessionUser({ sessionId: sid, userId: uid });
  const openedStack = [];
  let firstJoinedAt = null;
  let lastLeftAt = null;
  let totalSeconds = 0;
  let segmentCount = 0;
  const nowMs = Date.now();

  for (const ev of events || []) {
    const evType = String(ev?.event_type || '').trim().toLowerCase();
    const atMs = parseAsDate(ev?.event_at)?.getTime();
    if (!Number.isFinite(atMs)) continue;
    if (evType === 'joined' || evType === 'opened') {
      openedStack.push(atMs);
      if (!firstJoinedAt || atMs < firstJoinedAt.getTime()) firstJoinedAt = new Date(atMs);
      continue;
    }
    if ((evType === 'left' || evType === 'closed') && openedStack.length) {
      const openedAtMs = openedStack.pop();
      if (atMs > openedAtMs) {
        totalSeconds += Math.round((atMs - openedAtMs) / 1000);
        segmentCount += 1;
        if (!lastLeftAt || atMs > lastLeftAt.getTime()) lastLeftAt = new Date(atMs);
      }
    }
  }

  // Provisional open segments count toward running totals until closed.
  for (const openedAtMs of openedStack) {
    if (nowMs > openedAtMs) {
      totalSeconds += Math.round((nowMs - openedAtMs) / 1000);
      segmentCount += 1;
    }
  }

  await SupervisionSession.upsertAttendanceRollup({
    sessionId: sid,
    userId: uid,
    firstJoinedAt: firstJoinedAt ? parseDateTimeLocalString(firstJoinedAt.toISOString()) : null,
    lastLeftAt: lastLeftAt ? parseDateTimeLocalString(lastLeftAt.toISOString()) : null,
    totalSeconds,
    segmentCount,
    isFinalized: openedStack.length === 0
  });
  return {
    sessionId: sid,
    userId: uid,
    firstJoinedAt: firstJoinedAt ? firstJoinedAt.toISOString() : null,
    lastLeftAt: lastLeftAt ? lastLeftAt.toISOString() : null,
    totalSeconds,
    segmentCount,
    isFinalized: openedStack.length === 0
  };
}

async function getSupervisionPayEligibility({ agencyId, userId }) {
  const uid = Number(userId || 0);
  const aId = Number(agencyId || 0);
  if (!uid || !aId) return { eligible: false, isHourlyWorker: false, totalSupervisionHours: 0 };

  const u = await User.findById(uid);
  const isHourlyWorker = !!(u?.is_hourly_worker === 1 || u?.is_hourly_worker === true || u?.is_hourly_worker === '1');

  let totalSupervisionHours = 0;
  try {
    const [rows] = await pool.execute(
      `SELECT COALESCE(individual_hours, 0) + COALESCE(group_hours, 0) AS total_hours
       FROM supervision_accounts
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [aId, uid]
    );
    totalSupervisionHours = Number(rows?.[0]?.total_hours || 0);
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    totalSupervisionHours = 0;
  }

  const eligible = isHourlyWorker || totalSupervisionHours >= 100 - 1e-9;
  return { eligible, isHourlyWorker, totalSupervisionHours };
}

async function resolveSupervisionPayForParticipant({
  agencyId,
  userId,
  participantRole,
  sessionType,
  asOfDate
}) {
  const uid = Number(userId || 0);
  const aId = Number(agencyId || 0);
  if (!uid || !aId) {
    return {
      serviceCode: null,
      rateAmount: 0,
      rateUnit: 'per_hour',
      rateSource: 'none',
      payable: false,
      reason: 'missing_ids'
    };
  }

  const serviceCode = supervisionServiceCodeForParticipant({ participantRole, sessionType });
  const asOf = String(asOfDate || '').slice(0, 10) || null;
  const rateCard = await PayrollRateCard.findForUser(aId, uid);
  const perCodeRate = await PayrollRate.findBestRate({
    agencyId: aId,
    userId: uid,
    serviceCode,
    asOf
  });

  if (String(participantRole || '').toLowerCase() === 'supervisor') {
    // Supervisors: always paid at Supervision rate (99415); fall back to indirect for resilience.
    if (perCodeRate) {
      return {
        serviceCode,
        rateAmount: Number(perCodeRate.rate_amount || 0),
        rateUnit: isSupervisionMeetingCode(serviceCode)
          ? 'per_hour'
          : (String(perCodeRate.rate_unit || 'per_hour').trim().toLowerCase() || 'per_hour'),
        rateSource: 'per_code_rate',
        payable: true,
        reason: null
      };
    }
    return {
      serviceCode,
      rateAmount: Number(rateCard?.indirect_rate || 0),
      rateUnit: 'per_hour',
      rateSource: rateCard ? 'indirect_rate_fallback' : 'none',
      payable: true,
      reason: rateCard ? 'missing_supervision_rate_used_indirect' : 'missing_supervision_rate'
    };
  }

  const eligibility = await getSupervisionPayEligibility({ agencyId: aId, userId: uid });
  if (!eligibility.eligible) {
    return {
      serviceCode,
      rateAmount: 0,
      rateUnit: 'per_hour',
      rateSource: 'none',
      payable: false,
      reason: 'requires_100_hours_or_hourly_worker',
      eligibility
    };
  }

  if (perCodeRate) {
    return {
      serviceCode,
      rateAmount: Number(perCodeRate.rate_amount || 0),
      rateUnit: isSupervisionMeetingCode(serviceCode)
        ? 'per_hour'
        : (String(perCodeRate.rate_unit || 'per_hour').trim().toLowerCase() || 'per_hour'),
      rateSource: 'per_code_rate',
      payable: true,
      reason: null,
      eligibility
    };
  }

  return {
    serviceCode,
    rateAmount: Number(rateCard?.indirect_rate || 0),
    rateUnit: 'per_hour',
    rateSource: rateCard ? 'indirect_rate_fallback' : 'none',
    payable: true,
    reason: rateCard ? 'missing_meeting_rate_used_indirect' : 'missing_meeting_rate',
    eligibility
  };
}

export const listSupervisionProviderCandidates = async (req, res, next) => {
  try {
    const actorId = Number(req.user?.id || 0);
    const role = String(req.user?.role || '').trim().toLowerCase();
    if (!actorId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const allowedRoles = ['supervisor', 'admin', 'super_admin', 'support'];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: { message: 'Supervision participant selection is limited to supervisors and admins.' } });
    }

    const actorAgencies = await User.getAgencies(actorId);
    const actorAgencyIds = Array.from(
      new Set((actorAgencies || []).map((a) => Number(a?.id)).filter((n) => Number.isFinite(n) && n > 0))
    );
    if (!actorAgencyIds.length) {
      return res.json({ ok: true, agencyId: null, providers: [] });
    }

    const modeRaw = String(req.query?.mode || 'individual').trim().toLowerCase();
    const mode = modeRaw === 'group' ? 'group' : 'individual';
    const allAgencies = String(req.query?.allAgencies || '').trim().toLowerCase() === 'true';

    const requestedAgencyId = Number(req.query?.agencyId || 0);
    const agencyId = requestedAgencyId > 0 ? requestedAgencyId : actorAgencyIds[0];
    if (!allAgencies && !actorAgencyIds.includes(agencyId)) {
      return res.status(403).json({ error: { message: 'Access denied for this agency' } });
    }
    if (allAgencies && mode !== 'group') {
      return res.status(400).json({ error: { message: 'All-agencies supervision list is only available for group supervision.' } });
    }

    if (mode === 'individual') {
      const assigned = await SupervisorAssignment.findBySupervisor(actorId, agencyId);
      let providers = [];
      if ((assigned || []).length > 0) {
        const deduped = new Map();
        for (const row of assigned) {
          const id = Number(row?.supervisee_id || 0);
          if (!id || deduped.has(id)) continue;
          deduped.set(id, {
            id,
            firstName: String(row?.supervisee_first_name || '').trim(),
            lastName: String(row?.supervisee_last_name || '').trim(),
            email: String(row?.supervisee_email || '').trim().toLowerCase(),
            role: String(row?.supervisee_role || '').trim().toLowerCase()
          });
        }
        providers = Array.from(deduped.values());
      }
      // Admins without supervisee assignments: show all providers in agency for session creation
      if (providers.length === 0 && allowedRoles.includes(role)) {
        const [rows] = await pool.execute(
          `SELECT u.id, u.first_name, u.last_name, u.email, u.role
           FROM user_agencies ua
           JOIN users u ON u.id = ua.user_id
           WHERE ua.agency_id = ?
             AND (u.is_active IS NULL OR u.is_active = TRUE)
             AND (u.is_archived IS NULL OR u.is_archived = FALSE)
             AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
             AND LOWER(COALESCE(u.role, '')) NOT IN ('guardian', 'school_support')
           ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
          [agencyId]
        );
        providers = (rows || []).map((r) => ({
          id: Number(r.id),
          firstName: String(r.first_name || '').trim(),
          lastName: String(r.last_name || '').trim(),
          email: String(r.email || '').trim().toLowerCase(),
          role: String(r.role || '').trim().toLowerCase()
        }));
      }
      return res.json({ ok: true, agencyId, agencyIds: [agencyId], mode, providers });
    }

    const scopedAgencyIds = allAgencies ? actorAgencyIds : [agencyId];
    const placeholders = scopedAgencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT DISTINCT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.role
       FROM supervisor_assignments sa
       JOIN users u ON u.id = sa.supervisee_id
       WHERE sa.agency_id IN (${placeholders})
         AND (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
         AND LOWER(COALESCE(u.role, '')) NOT IN ('guardian', 'school_support')
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      scopedAgencyIds
    );

    const providers = (rows || []).map((r) => ({
      id: Number(r.id),
      firstName: String(r.first_name || '').trim(),
      lastName: String(r.last_name || '').trim(),
      email: String(r.email || '').trim().toLowerCase(),
      role: String(r.role || '').trim().toLowerCase()
    }));

    res.json({ ok: true, agencyId: allAgencies ? null : agencyId, agencyIds: scopedAgencyIds, mode, providers });
  } catch (e) {
    next(e);
  }
};

export const markSupervisionMeetingLifecycle = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const eventTypeRaw = String(req.body?.eventType || '').trim().toLowerCase();
    if (!['opened', 'closed', 'joined', 'left'].includes(eventTypeRaw)) {
      return res.status(400).json({ error: { message: 'eventType must be opened, closed, joined, or left' } });
    }
    const eventType = (eventTypeRaw === 'opened')
      ? 'joined'
      : (eventTypeRaw === 'closed' ? 'left' : eventTypeRaw);
    const eventAt = parseDateTimeLocalString(req.body?.eventAt) || mysqlNowDateTime();
    const clientSessionKey = String(req.body?.clientSessionKey || '').trim()
      || `web-${id}-${actorUserId}-${Date.now()}`;

    let attendee = await SupervisionSession.findAttendeeBySessionUser(id, actorUserId);
    if (!attendee) {
      const role = Number(row.supervisor_user_id) === actorUserId ? 'supervisor' : 'supervisee';
      await SupervisionSession.upsertAttendees(id, [{
        userId: actorUserId,
        participantRole: role,
        isRequired: true,
        isCompensableSnapshot: false,
        status: 'INVITED'
      }]);
      attendee = await SupervisionSession.findAttendeeBySessionUser(id, actorUserId);
    }

    await SupervisionSession.recordAttendanceEvent({
      sessionId: id,
      attendeeId: Number(attendee?.id || 0) || null,
      userId: actorUserId,
      participantSessionKey: clientSessionKey,
      eventType,
      eventAt,
      rawPayload: {
        source: 'web_app_modal',
        eventTypeRaw,
        actorUserId
      }
    });

    await SupervisionSession.setAttendeeStatus({
      sessionId: id,
      userId: actorUserId,
      status: eventType === 'joined' ? 'JOINED' : 'LEFT'
    });

    // Ensure each tracked meeting has an artifact shell tied to the session.
    if (eventTypeRaw === 'opened' || eventTypeRaw === 'closed') {
      await SupervisionSessionArtifact.ensureTagged({
        sessionId: id,
        updatedByUserId: actorUserId
      });
    }

    const rollup = await recomputeAttendanceRollupForUser({ sessionId: id, userId: actorUserId });
    res.json({
      ok: true,
      sessionId: id,
      userId: actorUserId,
      eventType,
      eventAt,
      clientSessionKey,
      rollup
    });
  } catch (e) {
    next(e);
  }
};

export const listSupervisionAttendanceLogs = async (req, res, next) => {
  try {
    const actorId = Number(req.user?.id || 0);
    if (!actorId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const role = String(req.user?.role || '').toLowerCase();

    const agencyId = Number(req.query?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const actorAgencies = await User.getAgencies(actorId);
    const hasAgencyAccess = (actorAgencies || []).some((a) => Number(a?.id) === agencyId);
    if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'Access denied for this agency' } });
    if (!canViewAgencySupervisionLogs(role)) {
      return res.status(403).json({ error: { message: 'Only admin/staff roles can view supervision attendance logs' } });
    }

    const startDate = String(req.query?.startDate || '').slice(0, 10) || null;
    const endDate = String(req.query?.endDate || '').slice(0, 10) || null;
    const sessionId = req.query?.sessionId ? Number(req.query.sessionId) : null;
    const userId = req.query?.userId ? Number(req.query.userId) : null;

    const rows = await SupervisionSession.listAttendanceLogsForAgency({
      agencyId,
      startDate,
      endDate,
      sessionId,
      userId
    });

    const logs = [];
    for (const r of (rows || [])) {
      const participantRole = String(r.participant_role || '').trim().toLowerCase() || 'supervisee';
      const pay = await resolveSupervisionPayForParticipant({
        agencyId,
        userId: Number(r.user_id),
        participantRole,
        sessionType: String(r.session_type || 'individual'),
        asOfDate: String(r.start_at || '').slice(0, 10)
      });
      const hours = Number(r.total_seconds || 0) / 3600;
      const unitHours = Number.isFinite(hours) ? Math.round(hours * 100) / 100 : 0;
      const rate = Number(pay.rateAmount || 0);
      const amount = pay.payable ? Math.round(unitHours * rate * 100) / 100 : 0;

      logs.push({
        sessionId: Number(r.session_id),
        agencyId: Number(r.agency_id),
        sessionType: String(r.session_type || 'individual'),
        sessionStatus: r.session_status || null,
        startAt: r.start_at,
        endAt: r.end_at,
        googleMeetLink: r.google_meet_link || null,
        artifactTaggedAt: r.artifact_tagged_at || null,
        transcriptUrl: r.artifact_transcript_url || null,
        summaryText: r.artifact_summary_text || null,
        supervisorName: String(r.supervisor_name || '').trim() || null,
        supervisorEmail: String(r.supervisor_email || '').trim() || null,
        userId: Number(r.user_id),
        participantName: String(r.participant_name || '').trim() || null,
        participantEmail: String(r.participant_email || '').trim() || null,
        participantRole,
        isRequired: Number(r.is_required || 0) === 1,
        firstJoinedAt: r.first_joined_at || null,
        lastLeftAt: r.last_left_at || null,
        totalSeconds: Number(r.total_seconds || 0),
        totalHours: unitHours,
        segmentCount: Number(r.segment_count || 0),
        isFinalized: Number(r.is_finalized || 0) === 1,
        pay: {
          payable: !!pay.payable,
          reason: pay.reason || null,
          serviceCode: pay.serviceCode || null,
          rateAmount: rate,
          rateUnit: pay.rateUnit || 'per_hour',
          rateSource: pay.rateSource || 'none',
          computedAmount: amount,
          eligibility: pay.eligibility || null
        }
      });
    }

    res.json({ ok: true, agencyId, count: logs.length, logs });
  } catch (e) {
    next(e);
  }
};

export const getSupervisionSessionArtifacts = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const role = String(req.user?.role || '').toLowerCase();
    if (!canViewSessionArtifacts(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    let artifact = await SupervisionSessionArtifact.findBySessionId(id);

    const hasTranscriptUrl = !!String(artifact?.transcript_url || '').trim();
    const hasTranscriptText = !!String(artifact?.transcript_text || '').trim();
    const canAttemptAutoPull = !hasTranscriptUrl && !hasTranscriptText
      && (!!String(row.google_meet_link || '').trim() || !!String(row.google_event_id || '').trim());

    if (canAttemptAutoPull) {
      const auto = await fetchMeetTranscriptForSession({
        hostEmail: row.google_host_email,
        meetLink: row.google_meet_link,
        googleEventId: row.google_event_id,
        sessionStartAt: row.start_at
      });
      if (auto?.ok && (String(auto.transcriptUrl || '').trim() || String(auto.transcriptText || '').trim())) {
        artifact = await SupervisionSessionArtifact.upsertBySessionId({
          sessionId: id,
          taggedAt: mysqlNowDateTime(),
          transcriptUrl: auto.transcriptUrl || null,
          transcriptText: auto.transcriptText || null,
          updatedByUserId: Number(req.user?.id || 0) || null
        });
      }
    }

    res.json({ ok: true, sessionId: id, artifact: artifact || null });
  } catch (e) {
    next(e);
  }
};

export const upsertSupervisionSessionArtifacts = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const role = String(req.user?.role || '').toLowerCase();
    if (!canViewSessionArtifacts(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const transcriptUrlInput = req.body?.transcriptUrl;
    const transcriptTextInput = req.body?.transcriptText;
    const summaryTextInput = req.body?.summaryText;
    const autoSummarize = req.body?.autoSummarize === true;

    const transcriptUrl = transcriptUrlInput === undefined ? undefined : String(transcriptUrlInput || '').trim().slice(0, 2048);
    const transcriptText = transcriptTextInput === undefined ? undefined : String(transcriptTextInput || '').trim().slice(0, 120000);
    let summaryText = summaryTextInput === undefined ? undefined : String(summaryTextInput || '').trim().slice(0, 120000);
    let summaryModel = undefined;
    let summaryGeneratedAt = undefined;

    if (autoSummarize && transcriptText) {
      const prompt = buildSupervisionSummaryPrompt(transcriptText);
      const summaryResp = await callGeminiText({
        prompt,
        temperature: 0.1,
        maxOutputTokens: 900
      });
      summaryText = String(summaryResp?.text || '').trim();
      summaryModel = String(summaryResp?.modelName || '').trim() || null;
      summaryGeneratedAt = mysqlNowDateTime();
    }

    const artifact = await SupervisionSessionArtifact.upsertBySessionId({
      sessionId: id,
      taggedAt: mysqlNowDateTime(),
      transcriptUrl,
      transcriptText,
      summaryText,
      summaryModel,
      summaryGeneratedAt,
      updatedByUserId: Number(req.user?.id || 0) || null
    });

    res.json({ ok: true, sessionId: id, artifact });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message || 'Failed to save supervision artifacts' } });
    }
    next(e);
  }
};

export const createSupervisionSessionValidators = [
  body('agencyId').isInt({ min: 1 }).withMessage('agencyId is required'),
  body('supervisorUserId').isInt({ min: 1 }).withMessage('supervisorUserId is required'),
  body('superviseeUserId').isInt({ min: 1 }).withMessage('superviseeUserId is required'),
  body('sessionType').optional().isIn(['individual', 'triadic', 'group']).withMessage('sessionType must be individual, triadic, or group'),
  body('additionalAttendeeUserIds').optional().isArray().withMessage('additionalAttendeeUserIds must be an array'),
  body('additionalAttendeeUserIds.*').optional().isInt({ min: 1 }).withMessage('additionalAttendeeUserIds must contain valid user ids'),
  body('requiredAttendeeUserIds').optional().isArray().withMessage('requiredAttendeeUserIds must be an array'),
  body('requiredAttendeeUserIds.*').optional().isInt({ min: 1 }).withMessage('requiredAttendeeUserIds must contain valid user ids'),
  body('optionalAttendeeUserIds').optional().isArray().withMessage('optionalAttendeeUserIds must be an array'),
  body('optionalAttendeeUserIds.*').optional().isInt({ min: 1 }).withMessage('optionalAttendeeUserIds must contain valid user ids'),
  body('presenterUserIds').optional().isArray().withMessage('presenterUserIds must be an array'),
  body('presenterUserIds.*').optional().isInt({ min: 1 }).withMessage('presenterUserIds must contain valid user ids'),
  body('startAt').not().isEmpty().withMessage('startAt is required'),
  body('endAt').not().isEmpty().withMessage('endAt is required'),
  body('createMeetLink').optional().isBoolean().withMessage('createMeetLink must be boolean')
];

export const patchSupervisionSessionValidators = [
  body('startAt').optional(),
  body('endAt').optional(),
  body('sessionType').optional().isIn(['individual', 'triadic', 'group']).withMessage('sessionType must be individual, triadic, or group'),
  body('presenterUserIds').optional().isArray().withMessage('presenterUserIds must be an array'),
  body('presenterUserIds.*').optional().isInt({ min: 1 }).withMessage('presenterUserIds must contain valid user ids'),
  body('notes').optional(),
  body('modality').optional(),
  body('locationText').optional(),
  body('createMeetLink').optional().isBoolean().withMessage('createMeetLink must be boolean')
];

export const createSupervisionSession = async (req, res, next) => {
  try {
    if (!requireValid(req, res)) return;
    const agencyId = parseInt(req.body?.agencyId, 10);
    const supervisorUserId = parseInt(req.body?.supervisorUserId, 10);
    const superviseeUserId = parseInt(req.body?.superviseeUserId, 10);
    const startAt = parseDateTimeLocalString(req.body?.startAt);
    const endAt = parseDateTimeLocalString(req.body?.endAt);
    const sessionType = String(req.body?.sessionType || 'individual').trim().toLowerCase();
    const modality = req.body?.modality ?? null;
    const locationText = req.body?.locationText ?? null;
    const notes = req.body?.notes ?? null;
    const createMeetLink = req.body?.createMeetLink === true;
    const additionalAttendeeUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.additionalAttendeeUserIds) ? req.body.additionalAttendeeUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId && n !== superviseeUserId)
      )
    );
    const requiredAttendeeUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.requiredAttendeeUserIds) ? req.body.requiredAttendeeUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId && n !== superviseeUserId)
      )
    );
    const optionalAttendeeUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.optionalAttendeeUserIds) ? req.body.optionalAttendeeUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId && n !== superviseeUserId)
      )
    );
    const presenterUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.presenterUserIds) ? req.body.presenterUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId)
      )
    ).slice(0, 2);

    if (!startAt || !endAt) return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    if (endAt <= startAt) return res.status(400).json({ error: { message: 'endAt must be after startAt' } });

    const ok = await canScheduleSession(req, { agencyId, supervisorUserId, superviseeUserId });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const { supOk, svOk } = await requireUsersInAgency({ agencyId, supervisorUserId, superviseeUserId });
    if (!supOk) return res.status(400).json({ error: { message: 'Supervisor does not belong to this agency' } });
    if (!svOk) return res.status(400).json({ error: { message: 'Supervisee does not belong to this agency' } });
    const allExtraAttendees = Array.from(new Set([
      ...additionalAttendeeUserIds,
      ...requiredAttendeeUserIds,
      ...optionalAttendeeUserIds
    ]));
    if (allExtraAttendees.length) {
      const agencyMap = await getUsersInAgencyMap({ agencyId, userIds: allExtraAttendees });
      const missing = allExtraAttendees.filter((uid) => !agencyMap[uid]);
      if (missing.length) {
        return res.status(400).json({ error: { message: 'One or more additional attendees do not belong to this agency', userIds: missing } });
      }
    }

    const supervisor = await User.findById(supervisorUserId);
    const supervisee = await User.findById(superviseeUserId);
    if (!supervisor || !supervisee) return res.status(404).json({ error: { message: 'User not found' } });

    const created = await SupervisionSession.create({
      agencyId,
      supervisorUserId,
      superviseeUserId,
      sessionType,
      startAt,
      endAt,
      modality: modality ? String(modality) : null,
      locationText: locationText ? String(locationText) : null,
      notes: notes ? String(notes) : null,
      createdByUserId: req.user.id
    });

    const requiredSet = new Set([superviseeUserId, ...additionalAttendeeUserIds, ...requiredAttendeeUserIds]);
    const optionalSet = new Set(optionalAttendeeUserIds.filter((uid) => !requiredSet.has(uid)));
    const superviseeIds = Array.from(new Set([...requiredSet, ...optionalSet]));
    const compensableMap = await User.getAgencySupervisionCompensableMap(agencyId, superviseeIds);
    await SupervisionSession.upsertAttendees(created.id, [
      {
        userId: supervisorUserId,
        participantRole: 'supervisor',
        isRequired: true,
        isCompensableSnapshot: false,
        status: 'INVITED'
      },
      ...superviseeIds.map((uid) => ({
        userId: uid,
        participantRole: 'supervisee',
        isRequired: !optionalSet.has(uid),
        isCompensableSnapshot: !!compensableMap[uid],
        status: 'INVITED'
      }))
    ]);
    const validPresenterIds = presenterUserIds.filter((uid) => superviseeIds.includes(uid) || uid === superviseeUserId);
    await SupervisionSession.setPresenters({
      sessionId: created.id,
      presenterUserIds: validPresenterIds,
      assignedByUserId: req.user.id
    });

    // Best-effort: sync to Google Calendar on supervisor calendar
    const hostEmail = String(supervisor.email || '').trim().toLowerCase();
    const attendeeEmail = String(supervisee.email || '').trim().toLowerCase();
    const extraAttendeeEmails = [];
    for (const uid of allExtraAttendees) {
      // eslint-disable-next-line no-await-in-loop
      const extraUser = await User.findById(uid);
      const email = String(extraUser?.email || '').trim().toLowerCase();
      if (email) extraAttendeeEmails.push(email);
    }
    const participantCount = 1 + extraAttendeeEmails.length;
    const summary = sessionType === 'group'
      ? `Group supervision (${participantCount})`
      : `Supervision — ${(supervisee.first_name || '').trim()} ${(supervisee.last_name || '').trim()}`.trim();
    const desc = notes ? String(notes) : null;
    const sync = await GoogleCalendarService.upsertSupervisionSession({
      supervisionSessionId: created.id,
      hostEmail,
      attendeeEmail,
      additionalAttendeeEmails: extraAttendeeEmails,
      startAt,
      endAt,
      summary,
      description: desc,
      createMeetLink
    });

    if (sync?.ok) {
      await SupervisionSession.setGoogleSync(created.id, {
        hostEmail,
        calendarId: sync.calendarId,
        eventId: sync.googleEventId,
        meetLink: sync.meetLink,
        status: 'SYNCED',
        errorMessage: null
      });
    } else {
      await SupervisionSession.setGoogleSync(created.id, {
        hostEmail,
        calendarId: 'primary',
        eventId: null,
        meetLink: null,
        status: 'FAILED',
        errorMessage: sync?.error || sync?.reason || 'Google sync failed'
      });
    }

    const out = await SupervisionSession.findById(created.id);
    res.status(201).json({ ok: true, session: out });
  } catch (e) {
    next(e);
  }
};

export const patchSupervisionSession = async (req, res, next) => {
  try {
    if (!requireValid(req, res)) return;

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });
    if (String(row.status || '').toUpperCase() === 'CANCELLED') {
      return res.status(400).json({ error: { message: 'Cannot edit a cancelled session' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const startAt = req.body?.startAt !== undefined ? parseDateTimeLocalString(req.body?.startAt) : undefined;
    const endAt = req.body?.endAt !== undefined ? parseDateTimeLocalString(req.body?.endAt) : undefined;
    const sessionType = req.body?.sessionType !== undefined ? String(req.body?.sessionType || '').trim().toLowerCase() : undefined;
    const notes = req.body?.notes !== undefined ? (req.body?.notes ? String(req.body.notes) : '') : undefined;
    const modality = req.body?.modality !== undefined ? (req.body?.modality ? String(req.body.modality) : null) : undefined;
    const locationText = req.body?.locationText !== undefined ? (req.body?.locationText ? String(req.body.locationText) : null) : undefined;
    const createMeetLink = req.body?.createMeetLink === true;
    const presenterUserIds = req.body?.presenterUserIds !== undefined
      ? Array.from(
        new Set(
          (Array.isArray(req.body?.presenterUserIds) ? req.body.presenterUserIds : [])
            .map((n) => parseInt(n, 10))
            .filter((n) => Number.isFinite(n) && n > 0 && n !== Number(row.supervisor_user_id))
        )
      ).slice(0, 2)
      : undefined;

    const nextStart = startAt !== undefined ? startAt : row.start_at;
    const nextEnd = endAt !== undefined ? endAt : row.end_at;
    if (!nextStart || !nextEnd) return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    if (String(nextEnd) <= String(nextStart)) return res.status(400).json({ error: { message: 'endAt must be after startAt' } });

    const updated = await SupervisionSession.updateById(id, {
      startAt: startAt !== undefined ? startAt : undefined,
      endAt: endAt !== undefined ? endAt : undefined,
      sessionType,
      notes,
      modality,
      locationText
    });
    if (presenterUserIds !== undefined) {
      const attendees = await SupervisionSession.listAttendees(id);
      const allowed = new Set((attendees || []).filter((a) => String(a?.participant_role || '') === 'supervisee').map((a) => Number(a.user_id)));
      if (Number(row.supervisee_user_id || 0)) allowed.add(Number(row.supervisee_user_id));
      const validPresenterIds = presenterUserIds.filter((uid) => allowed.has(uid));
      await SupervisionSession.setPresenters({
        sessionId: id,
        presenterUserIds: validPresenterIds,
        assignedByUserId: req.user.id
      });
    }

    // Best-effort: patch/insert Google event on supervisor calendar (keep existing meet link unless requested and missing)
    const supervisor = await User.findById(row.supervisor_user_id);
    const supervisee = await User.findById(row.supervisee_user_id);
    const hostEmail = String(row.google_host_email || supervisor?.email || '').trim().toLowerCase();
    const attendeeEmail = String(supervisee?.email || '').trim().toLowerCase();

    const summary = `Supervision — ${(supervisee?.first_name || '').trim()} ${(supervisee?.last_name || '').trim()}`.trim();
    const desc = updated?.notes ? String(updated.notes) : null;

    const sync = await GoogleCalendarService.upsertSupervisionSession({
      supervisionSessionId: id,
      hostEmail,
      attendeeEmail,
      startAt: nextStart,
      endAt: nextEnd,
      summary,
      description: desc,
      createMeetLink: createMeetLink && !String(row.google_meet_link || '').trim(),
      existingGoogleEventId: row.google_event_id || null,
      existingMeetLink: row.google_meet_link || null
    });

    if (sync?.ok) {
      await SupervisionSession.setGoogleSync(id, {
        hostEmail,
        calendarId: sync.calendarId,
        eventId: sync.googleEventId,
        meetLink: sync.meetLink || row.google_meet_link || null,
        status: 'SYNCED',
        errorMessage: null
      });
    } else {
      await SupervisionSession.setGoogleSync(id, {
        hostEmail,
        calendarId: row.google_calendar_id || 'primary',
        eventId: row.google_event_id || null,
        meetLink: row.google_meet_link || null,
        status: 'FAILED',
        errorMessage: sync?.error || sync?.reason || 'Google sync failed'
      });
    }

    const out = await SupervisionSession.findById(id);
    res.json({ ok: true, session: out });
  } catch (e) {
    next(e);
  }
};

export const cancelSupervisionSession = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const cancelled = await SupervisionSession.cancel(id);

    // Best-effort delete in Google
    const hostEmail = String(row.google_host_email || '').trim() || (await User.findById(row.supervisor_user_id))?.email;
    if (hostEmail && row.google_event_id) {
      await GoogleCalendarService.cancelSupervisionSessionGoogleEvent({
        hostEmail,
        googleEventId: row.google_event_id
      });
    }

    res.json({ ok: true, session: cancelled });
  } catch (e) {
    next(e);
  }
};

/**
 * Get supervision hours summary for a supervisee. Supervisor or admin/support only.
 * GET /supervision/supervisee/:superviseeId/hours-summary?agencyId=...
 */
export const getSuperviseeHoursSummary = async (req, res, next) => {
  try {
    const requesterId = Number(req.user?.id || 0);
    const superviseeId = req.params.superviseeId ? parseInt(req.params.superviseeId, 10) : null;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!requesterId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!superviseeId) return res.status(400).json({ error: { message: 'superviseeId is required' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    if (requesterId !== superviseeId) {
      const role = String(req.user?.role || '').toLowerCase();
      const isAdminOrSupport = role === 'admin' || role === 'super_admin' || role === 'support';
      if (!isAdminOrSupport) {
        const hasAccess = await User.supervisorHasAccess(requesterId, superviseeId, agencyId);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied. You can only view hours for your assigned supervisees.' } });
        }
      }
    }

    const summary = await SupervisionSession.getHoursSummaryForSupervisee(agencyId, superviseeId);
    res.json({
      ok: true,
      agencyId,
      superviseeId,
      totalHours: summary.totalHours,
      totalSeconds: summary.totalSeconds,
      sessionCount: summary.sessionCount
    });
  } catch (e) {
    next(e);
  }
};

export const getMySupervisionPrompts = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    const agencyId = req.query?.agencyId ? Number(req.query.agencyId) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const now = new Date();
    const rows = await SupervisionSession.listPromptSessionsForUser({
      userId,
      agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null,
      now
    });

    const prompts = (rows || []).map((row) => {
      const start = new Date(row.startAt || 0);
      const end = new Date(row.endAt || 0);
      const startsInMinutes = Number.isFinite(start.getTime())
        ? Math.round((start.getTime() - now.getTime()) / 60000)
        : null;
      const inPromptWindow = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
        ? now >= new Date(start.getTime() - 5 * 60 * 1000) && now <= end
        : false;
      return {
        ...row,
        startsInMinutes,
        isLive: Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? now >= start && now <= end : false,
        inPromptWindow,
        promptStyle: row.isRequired ? 'required_splash' : 'optional_card'
      };
    }).filter((row) => row.inPromptWindow);

    res.json({ ok: true, prompts, now: now.toISOString() });
  } catch (e) {
    next(e);
  }
};

export const getMyPresenterAssignments = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    const agencyId = req.query?.agencyId ? Number(req.query.agencyId) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const now = new Date();
    const rows = await SupervisionSession.listPresenterAssignmentsForUser({
      userId,
      agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null,
      now
    });

    const out = [];
    for (const row of rows || []) {
      await SupervisionSession.ensurePresenterReminders({
        presenterAssignmentId: row.presenter_assignment_id,
        userId,
        agencyId: row.agency_id,
        sessionId: row.session_id,
        sessionType: row.session_type,
        supervisorName: row.supervisor_name,
        startAt: row.start_at,
        now
      });
      const start = new Date(row.start_at || 0);
      const startsInMinutes = Number.isFinite(start.getTime())
        ? Math.round((start.getTime() - now.getTime()) / 60000)
        : null;
      out.push({
        presenterAssignmentId: Number(row.presenter_assignment_id),
        sessionId: Number(row.session_id),
        agencyId: Number(row.agency_id),
        sessionType: String(row.session_type || 'group'),
        presenterRole: String(row.presenter_role || 'primary'),
        presenterStatus: String(row.presenter_status || 'assigned'),
        topicSummary: row.topic_summary || null,
        startAt: row.start_at,
        endAt: row.end_at,
        sessionStatus: row.session_status,
        googleMeetLink: row.google_meet_link || null,
        supervisorName: String(row.supervisor_name || '').trim() || null,
        startsInMinutes,
        reminderStage: startsInMinutes !== null
          ? (startsInMinutes <= 60 ? 'h1' : (startsInMinutes <= (24 * 60) ? 'h24' : (startsInMinutes <= (7 * 24 * 60) ? 'd7' : null)))
          : null
      });
    }

    res.json({ ok: true, assignments: out, now: now.toISOString() });
  } catch (e) {
    next(e);
  }
};

export const getSessionPresenters = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const presenters = await SupervisionSession.listPresentersForSession(id);
    res.json({ ok: true, presenters });
  } catch (e) {
    next(e);
  }
};

export const markSessionPresenterPresented = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const presenterUserId = parseInt(req.params.userId, 10);
    const presented = req.body?.presented !== false;
    if (!id || !presenterUserId) return res.status(400).json({ error: { message: 'Invalid session/presenter id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const role = String(req.user?.role || '').toLowerCase();
    const actorUserId = Number(req.user?.id || 0);
    const isSupervisorActor = actorUserId === Number(row.supervisor_user_id);
    const isPrivileged = ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(role);
    if (!isSupervisorActor && !isPrivileged) {
      return res.status(403).json({ error: { message: 'Only supervisors or authorized staff can mark presenters as presented.' } });
    }

    const okAccess = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!okAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    const status = presented ? 'presented' : 'assigned';
    const ok = await SupervisionSession.setPresenterStatus({
      sessionId: id,
      userId: presenterUserId,
      status
    });
    if (!ok) return res.status(404).json({ error: { message: 'Presenter assignment not found for this session' } });

    const presenters = await SupervisionSession.listPresentersForSession(id);
    res.json({ ok: true, presenters, status });
  } catch (e) {
    next(e);
  }
};

