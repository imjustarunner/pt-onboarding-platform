import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import { listPairedEventProviderAttendance } from './skillBuildersEventKioskPunch.service.js';
import { computeEventDirectIndirectHours } from '../utils/eventPayrollHours.util.js';

function parsePositiveInt(raw) {
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseClaimPayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

function groupClaimsIntoSubmissions(claimRows, eventTitlesById) {
  const byPunchIn = new Map();

  for (const row of claimRows || []) {
    const payload = parseClaimPayload(row.payload_json);
    const punchInId = parsePositiveInt(payload.kioskPunchInId);
    if (!punchInId) continue;

    const key = punchInId;
    if (!byPunchIn.has(key)) {
      const eventId = parsePositiveInt(payload.companyEventId);
      byPunchIn.set(key, {
        punchInId: key,
        punchOutId: parsePositiveInt(payload.kioskPunchOutId),
        userId: Number(row.user_id),
        providerName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        companyEventId: eventId,
        eventTitle: eventId ? (eventTitlesById.get(eventId) || `Event #${eventId}`) : '',
        companyEventSessionId: payload.companyEventSessionId != null ? Number(payload.companyEventSessionId) : null,
        clockInAt: payload.clockInAt || null,
        clockOutAt: payload.clockOutAt || null,
        workedHours: payload.workedHours != null ? Number(payload.workedHours) : null,
        directHours: payload.directHours != null ? Number(payload.directHours) : null,
        indirectHours: payload.indirectHours != null ? Number(payload.indirectHours) : null,
        directHoursCap: payload.directHoursCap != null ? Number(payload.directHoursCap) : null,
        source: payload.source || null,
        wasEdited: payload.wasEdited === true,
        lastEditedByRole: payload.lastEditedByRole || null,
        lastEditedAt: payload.lastEditedAt || null,
        originalValues: payload.originalValues || null,
        directClaim: null,
        indirectClaim: null
      });
    }

    const entry = byPunchIn.get(key);
    const bucket = String(row.bucket || payload.bucketRole || '').toLowerCase();
    const claimSummary = {
      id: Number(row.id),
      status: row.status,
      bucket: bucket || null,
      creditsHours: row.credits_hours != null ? Number(row.credits_hours) : null,
      targetPayrollPeriodId: row.target_payroll_period_id != null ? Number(row.target_payroll_period_id) : null,
      suggestedPayrollPeriodId: row.suggested_payroll_period_id != null ? Number(row.suggested_payroll_period_id) : null
    };

    if (bucket === 'direct' || (!entry.directClaim && payload.bucketRole === 'direct')) {
      entry.directClaim = claimSummary;
    } else if (bucket === 'indirect' || payload.bucketRole === 'indirect') {
      entry.indirectClaim = claimSummary;
    } else if (!entry.directClaim) {
      entry.directClaim = claimSummary;
    } else if (!entry.indirectClaim) {
      entry.indirectClaim = claimSummary;
    }
  }

  return [...byPunchIn.values()];
}

export async function listEventTimeSubmissionsForAgency({
  agencyId,
  status = 'submitted',
  suggestedPeriodId = null,
  companyEventId = null
}) {
  const aid = parsePositiveInt(agencyId);
  if (!aid) return [];

  const params = [aid, 'skill_builder_event'];
  let where = `c.agency_id = ? AND c.claim_type = ?`;
  if (status) {
    where += ' AND c.status = ?';
    params.push(String(status));
  }
  const periodId = parsePositiveInt(suggestedPeriodId);
  if (periodId) {
    where += ' AND c.suggested_payroll_period_id = ?';
    params.push(periodId);
  }
  const eventId = parsePositiveInt(companyEventId);
  if (eventId) {
    where += ` AND JSON_UNQUOTE(JSON_EXTRACT(c.payload_json, '$.companyEventId')) = ?`;
    params.push(String(eventId));
  }

  const [rows] = await pool.execute(
    `SELECT c.id, c.user_id, c.status, c.bucket, c.credits_hours, c.payload_json,
            c.suggested_payroll_period_id, c.target_payroll_period_id,
            u.first_name, u.last_name
     FROM payroll_time_claims c
     INNER JOIN users u ON u.id = c.user_id
     WHERE ${where}
     ORDER BY c.claim_date DESC, c.id DESC
     LIMIT 500`,
    params
  ).catch((err) => {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [[]];
    throw err;
  });

  const eventIds = new Set();
  for (const row of rows || []) {
    const payload = parseClaimPayload(row.payload_json);
    const eid = parsePositiveInt(payload.companyEventId);
    if (eid) eventIds.add(eid);
  }

  const eventTitlesById = new Map();
  if (eventIds.size) {
    const ph = [...eventIds].map(() => '?').join(',');
    const [evRows] = await pool.execute(
      `SELECT id, title FROM company_events WHERE id IN (${ph})`,
      [...eventIds]
    );
    for (const ev of evRows || []) {
      eventTitlesById.set(Number(ev.id), ev.title || '');
    }
  }

  return groupClaimsIntoSubmissions(rows, eventTitlesById);
}

export async function listMyEventTimeSessions({ agencyId, userId, limit = 50 }) {
  const aid = parsePositiveInt(agencyId);
  const uid = parsePositiveInt(userId);
  if (!aid || !uid) return [];

  const [eventRows] = await pool.execute(
    `SELECT DISTINCT ce.id
     FROM company_events ce
     INNER JOIN skill_builders_event_kiosk_punches p ON p.company_event_id = ce.id
     WHERE ce.agency_id = ? AND p.user_id = ?
     ORDER BY ce.id DESC
     LIMIT 20`,
    [aid, uid]
  ).catch((err) => {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [[]];
    throw err;
  });

  const sessions = [];
  for (const ev of eventRows || []) {
    const eventId = Number(ev.id);
    const [titleRows] = await pool.execute(
      `SELECT title, skill_builder_direct_hours FROM company_events WHERE id = ? LIMIT 1`,
      [eventId]
    );
    const paired = await listPairedEventProviderAttendance(eventId, {
      userId: uid,
      agencyId: aid
    });
    for (const row of paired) {
      sessions.push({
        ...row,
        companyEventId: eventId,
        eventTitle: titleRows?.[0]?.title || `Event #${eventId}`
      });
    }
  }

  return sessions
    .sort((a, b) => new Date(b.clockInAt || 0) - new Date(a.clockInAt || 0))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
}

async function loadSubmissionClaimsByPunchIn(punchInId, agencyId) {
  const pid = parsePositiveInt(punchInId);
  const aid = parsePositiveInt(agencyId);
  if (!pid || !aid) return [];

  const [rows] = await pool.execute(
    `SELECT * FROM payroll_time_claims
     WHERE agency_id = ? AND claim_type = 'skill_builder_event'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.kioskPunchInId')) = ?
     ORDER BY id ASC`,
    [aid, String(pid)]
  );
  return (rows || []).map((r) => PayrollTimeClaim._normalize(r));
}

export async function updateEventTimeSubmission({
  agencyId,
  punchInId,
  clockInAt,
  clockOutAt,
  directHoursCap,
  editedBy = null,
  ownerUserId = null
}) {
  const claims = await loadSubmissionClaimsByPunchIn(punchInId, agencyId);
  if (!claims.length) {
    return { error: { status: 404, message: 'Event time submission not found' } };
  }

  const pending = claims.filter((c) => ['submitted', 'deferred'].includes(String(c.status || '').toLowerCase()));
  if (!pending.length) {
    return { error: { status: 409, message: 'This time has already been approved by payroll and can no longer be edited.' } };
  }

  // Ownership guard: when an employee edits their own time, every pending claim
  // for this punch must belong to them.
  if (ownerUserId != null) {
    const allOwned = pending.every((c) => Number(c.user_id ?? c.userId) === Number(ownerUserId));
    if (!allOwned) {
      return { error: { status: 403, message: 'You can only edit your own event time.' } };
    }
  }

  const basePayload = pending[0].payload || {};
  const cap = directHoursCap != null
    ? Number(directHoursCap)
    : Number(basePayload.directHoursCap || 0);

  const resolvedClockIn = clockInAt || basePayload.clockInAt;
  const resolvedClockOut = clockOutAt || basePayload.clockOutAt;

  const split = computeEventDirectIndirectHours({
    clockInAt: resolvedClockIn,
    clockOutAt: resolvedClockOut,
    directHoursCap: cap
  });

  // On the very first edit, stamp the original auto-submitted values once so
  // payroll can always compare against what was auto-generated. Never overwrite.
  const original = basePayload.originalValues ?? {
    clockInAt: basePayload.clockInAt || null,
    clockOutAt: basePayload.clockOutAt || null,
    directHours: basePayload.directHours != null ? Number(basePayload.directHours) : null,
    indirectHours: basePayload.indirectHours != null ? Number(basePayload.indirectHours) : null
  };

  const byRole = editedBy?.role ?? (ownerUserId != null ? 'employee' : 'payroll');

  const nextPayloadBase = {
    ...basePayload,
    clockInAt: resolvedClockIn || basePayload.clockInAt,
    clockOutAt: resolvedClockOut || basePayload.clockOutAt,
    workedHours: split.workedHours,
    directHours: split.directHours,
    indirectHours: split.indirectHours,
    directHoursCap: split.directHoursCap,
    originalValues: original,
    wasEdited: true,
    lastEditedByRole: byRole,
    lastEditedAt: new Date().toISOString()
  };

  const punchOutId = parsePositiveInt(basePayload.kioskPunchOutId);
  const punchInIdNum = parsePositiveInt(punchInId);

  if (punchInIdNum && clockInAt) {
    await pool.execute(
      `UPDATE skill_builders_event_kiosk_punches SET punched_at = ? WHERE id = ?`,
      [new Date(clockInAt), punchInIdNum]
    ).catch(() => null);
  }
  if (punchOutId && clockOutAt) {
    await pool.execute(
      `UPDATE skill_builders_event_kiosk_punches SET punched_at = ? WHERE id = ?`,
      [new Date(clockOutAt), punchOutId]
    ).catch(() => null);
  }

  for (const claim of pending) {
    const bucketRole = claim.payload?.bucketRole
      || (String(claim.bucket || '').toLowerCase() === 'direct' ? 'direct' : 'indirect');
    const hours = bucketRole === 'direct' ? split.directHours : split.indirectHours;
    await PayrollTimeClaim.updatePayload({
      id: claim.id,
      payload: {
        ...nextPayloadBase,
        bucketRole,
        siblingClaimId: claim.payload?.siblingClaimId || null
      }
    });
    await pool.execute(
      `UPDATE payroll_time_claims SET credits_hours = ? WHERE id = ?`,
      [hours, claim.id]
    );
  }

  const pendingDirect = pending.find((c) =>
    String(c.payload?.bucketRole || c.bucket || '').toLowerCase() === 'direct'
    || String(c.bucket || '').toLowerCase() === 'direct'
  );
  const pendingIndirect = pending.find((c) =>
    String(c.payload?.bucketRole || c.bucket || '').toLowerCase() === 'indirect'
    || String(c.bucket || '').toLowerCase() === 'indirect'
  );
  const templateClaim = pending[0];
  let directClaimId = pendingDirect?.id || null;
  let indirectClaimId = pendingIndirect?.id || null;

  if (split.directHours > 0 && !pendingDirect) {
    const created = await PayrollTimeClaim.create({
      agencyId,
      userId: templateClaim.user_id || templateClaim.userId,
      submittedByUserId: templateClaim.submitted_by_user_id || templateClaim.submittedByUserId || templateClaim.user_id,
      status: 'submitted',
      claimType: 'skill_builder_event',
      claimDate: String(nextPayloadBase.clockOutAt || '').slice(0, 10) || templateClaim.claim_date,
      suggestedPayrollPeriodId: templateClaim.suggested_payroll_period_id || templateClaim.suggestedPayrollPeriodId || null,
      payload: { ...nextPayloadBase, bucketRole: 'direct', siblingClaimId: indirectClaimId }
    });
    await pool.execute(
      `UPDATE payroll_time_claims SET bucket = 'direct', credits_hours = ? WHERE id = ?`,
      [split.directHours, created.id]
    );
    directClaimId = created.id;
  }

  if (split.indirectHours > 0 && !pendingIndirect) {
    const created = await PayrollTimeClaim.create({
      agencyId,
      userId: templateClaim.user_id || templateClaim.userId,
      submittedByUserId: templateClaim.submitted_by_user_id || templateClaim.submittedByUserId || templateClaim.user_id,
      status: 'submitted',
      claimType: 'skill_builder_event',
      claimDate: String(nextPayloadBase.clockOutAt || '').slice(0, 10) || templateClaim.claim_date,
      suggestedPayrollPeriodId: templateClaim.suggested_payroll_period_id || templateClaim.suggestedPayrollPeriodId || null,
      payload: { ...nextPayloadBase, bucketRole: 'indirect', siblingClaimId: directClaimId }
    });
    await pool.execute(
      `UPDATE payroll_time_claims SET bucket = 'indirect', credits_hours = ? WHERE id = ?`,
      [split.indirectHours, created.id]
    );
    indirectClaimId = created.id;
  }

  if (directClaimId && indirectClaimId) {
    await PayrollTimeClaim.updatePayload({
      id: directClaimId,
      payload: { ...nextPayloadBase, bucketRole: 'direct', siblingClaimId: indirectClaimId }
    });
    await PayrollTimeClaim.updatePayload({
      id: indirectClaimId,
      payload: { ...nextPayloadBase, bucketRole: 'indirect', siblingClaimId: directClaimId }
    });
  }

  if (punchOutId) {
    try {
      await pool.execute(
        `UPDATE skill_builders_event_kiosk_punches
         SET payroll_time_claim_id = ?, payroll_indirect_claim_id = ?
         WHERE id IN (?, ?)`,
        [directClaimId, indirectClaimId, punchInIdNum, punchOutId]
      );
    } catch (err) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
    }
  }

  return {
    ok: true,
    workedHours: split.workedHours,
    directHours: split.directHours,
    indirectHours: split.indirectHours
  };
}

export async function buildEventProviderAttendanceCsv(eventId, agencyId, { userId = null } = {}) {
  const eid = parsePositiveInt(eventId);
  const aid = parsePositiveInt(agencyId);
  if (!eid || !aid) return '';

  const [evRows] = await pool.execute(
    `SELECT title FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1`,
    [eid, aid]
  );
  const eventTitle = evRows?.[0]?.title || `Event ${eid}`;
  const rows = await listPairedEventProviderAttendance(eid, { userId, agencyId: aid });

  const header = [
    'Event',
    'Provider',
    'UserId',
    'ClockIn',
    'ClockOut',
    'WorkedHrs',
    'DirectHrs',
    'IndirectHrs',
    'DirectClaimStatus',
    'IndirectClaimStatus',
    'SessionId'
  ];

  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      eventTitle,
      r.providerName,
      r.userId,
      r.clockInAt ? new Date(r.clockInAt).toISOString() : '',
      r.clockOutAt ? new Date(r.clockOutAt).toISOString() : '',
      r.workedHours ?? '',
      r.directHours ?? '',
      r.indirectHours ?? '',
      r.directClaimStatus ?? '',
      r.indirectClaimStatus ?? '',
      r.sessionId ?? ''
    ].map(escape).join(','));
  }
  return `\ufeff${lines.join('\n')}`;
}
