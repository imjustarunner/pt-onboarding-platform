import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import { computeEventDirectIndirectHours, roundEventPayrollHours as round2 } from '../utils/eventPayrollHours.util.js';

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export async function clientOnSkillBuilderEventRoster(clientId, eventId, agencyId) {
  const cid = parsePositiveInt(clientId);
  const eid = parsePositiveInt(eventId);
  const aid = parsePositiveInt(agencyId);
  if (!cid || !eid || !aid) return false;
  const [r] = await pool.execute(
    `SELECT 1 AS ok
     FROM skills_group_clients sgc
     INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id
     WHERE sg.company_event_id = ? AND sg.agency_id = ? AND sgc.client_id = ?
     LIMIT 1`,
    [eid, aid, cid]
  );
  return !!r?.[0]?.ok;
}

export async function providerOnSkillBuilderEventRoster(providerUserId, eventId, agencyId) {
  const pid = parsePositiveInt(providerUserId);
  const eid = parsePositiveInt(eventId);
  const aid = parsePositiveInt(agencyId);
  if (!pid || !eid || !aid) return false;
  const [r] = await pool.execute(
    `SELECT 1 AS ok
     FROM skills_group_providers sgp
     INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id
     WHERE sg.company_event_id = ? AND sg.agency_id = ? AND sgp.provider_user_id = ?
     LIMIT 1`,
    [eid, aid, pid]
  );
  return !!r?.[0]?.ok;
}

/** Staff on event roster via skills groups, provider assignments, or session providers. */
export async function providerOnEventStaffRoster(providerUserId, eventId, agencyId) {
  if (await providerOnSkillBuilderEventRoster(providerUserId, eventId, agencyId)) return true;

  const pid = parsePositiveInt(providerUserId);
  const eid = parsePositiveInt(eventId);
  if (!pid || !eid) return false;

  try {
    const [r] = await pool.execute(
      `SELECT 1 AS ok FROM company_event_provider_assignments
       WHERE company_event_id = ? AND provider_user_id = ? LIMIT 1`,
      [eid, pid]
    );
    if (r?.[0]?.ok) return true;
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  try {
    const [r] = await pool.execute(
      `SELECT 1 AS ok FROM company_event_session_providers
       WHERE company_event_id = ? AND provider_user_id = ? LIMIT 1`,
      [eid, pid]
    );
    if (r?.[0]?.ok) return true;
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  return false;
}

export async function resolveSessionIdForKioskDate(poolConn, eventId, kioskDateYmd) {
  const eid = parsePositiveInt(eventId);
  const ymd = String(kioskDateYmd || '').trim().slice(0, 10);
  if (!eid || !ymd) return null;
  try {
    const [rows] = await poolConn.execute(
      `SELECT id FROM skill_builders_event_sessions
       WHERE company_event_id = ? AND session_date = ?
       ORDER BY starts_at ASC, id ASC LIMIT 1`,
      [eid, ymd]
    );
    return rows?.[0]?.id ? Number(rows[0].id) : null;
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return null;
    throw err;
  }
}

/**
 * If the user has an open clock-in tied to a session and the agency has
 * `skill_builder_auto_clock_out_minutes_after_session_end` set, auto clock-out
 * at session end + that many minutes when the user attempts a new clock-in.
 */
async function maybeAutoClockOutStaleOpenPunch(poolConn, { agencyId, eventId, userId, source }) {
  const aid = parsePositiveInt(agencyId);
  const eid = parsePositiveInt(eventId);
  const uid = parsePositiveInt(userId);
  if (!aid || !eid || !uid) return;

  const [lastInRows] = await poolConn.execute(
    `SELECT id, punched_at, session_id FROM skill_builders_event_kiosk_punches
     WHERE company_event_id = ? AND user_id = ? AND punch_type = 'clock_in'
     ORDER BY punched_at DESC LIMIT 1`,
    [eid, uid]
  );
  const lastIn = lastInRows?.[0];
  if (!lastIn) return;

  const [outCheck] = await poolConn.execute(
    `SELECT id FROM skill_builders_event_kiosk_punches
     WHERE company_event_id = ? AND user_id = ? AND punch_type = 'clock_out' AND punched_at >= ?
     LIMIT 1`,
    [eid, uid, lastIn.punched_at]
  );
  if (outCheck?.[0]) return;

  const sid = lastIn.session_id != null ? Number(lastIn.session_id) : null;
  if (!sid) return;

  let autoMins = 0;
  try {
    const [agRows] = await poolConn.execute(
      `SELECT skill_builder_auto_clock_out_minutes_after_session_end FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    autoMins = Number(agRows?.[0]?.skill_builder_auto_clock_out_minutes_after_session_end);
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') autoMins = 0;
    else throw e;
  }
  if (!Number.isFinite(autoMins) || autoMins <= 0) return;

  const [sRows] = await poolConn.execute(
    `SELECT ends_at FROM skill_builders_event_sessions WHERE id = ? AND company_event_id = ? LIMIT 1`,
    [sid, eid]
  );
  const endsRaw = sRows?.[0]?.ends_at;
  const endsAt = endsRaw ? new Date(endsRaw) : null;
  if (!endsAt || !Number.isFinite(endsAt.getTime())) return;

  const cutoff = new Date(endsAt.getTime() + autoMins * 60 * 1000);
  const now = new Date();
  if (now <= cutoff) return;

  await recordSkillBuilderEventClockOut(poolConn, {
    agencyId: aid,
    eventId: eid,
    userId: uid,
    clockOutAt: cutoff,
    source: source || 'auto'
  });
}

async function createSkillBuilderEventPayrollClaims(poolConn, {
  agencyId,
  eventId,
  userId,
  lastIn,
  punchOutId,
  tIn,
  tOut,
  workedHours,
  directHours,
  indirectHours,
  directHoursCap,
  outClientId,
  outSessionId,
  source
}) {
  const claimDate = tOut.toISOString().slice(0, 10);
  const [pRows] = await poolConn.execute(
    `SELECT id FROM payroll_periods
     WHERE agency_id = ? AND period_start <= ? AND period_end >= ?
     ORDER BY period_end ASC LIMIT 1`,
    [agencyId, claimDate, claimDate]
  );
  const suggestedPayrollPeriodId = pRows?.[0]?.id ? Number(pRows[0].id) : null;

  const basePayload = {
    companyEventId: eventId,
    companyEventSessionId: outSessionId,
    clientId: outClientId,
    clockInAt: lastIn.punched_at,
    clockOutAt: tOut.toISOString(),
    workedHours: round2(workedHours),
    directHours: round2(directHours),
    indirectHours: round2(indirectHours),
    directHoursCap: round2(directHoursCap),
    kioskPunchInId: lastIn.id,
    kioskPunchOutId: punchOutId,
    source: source || 'portal'
  };

  let directClaimId = null;
  let indirectClaimId = null;

  if (directHours > 0) {
    const directClaim = await PayrollTimeClaim.create({
      agencyId,
      userId,
      submittedByUserId: userId,
      status: 'submitted',
      claimType: 'skill_builder_event',
      claimDate,
      suggestedPayrollPeriodId,
      payload: { ...basePayload, bucketRole: 'direct' }
    });
    await poolConn.execute(
      `UPDATE payroll_time_claims SET bucket = 'direct', credits_hours = ? WHERE id = ?`,
      [round2(directHours), directClaim.id]
    );
    directClaimId = directClaim.id;
  }

  if (indirectHours > 0) {
    const indirectClaim = await PayrollTimeClaim.create({
      agencyId,
      userId,
      submittedByUserId: userId,
      status: 'submitted',
      claimType: 'skill_builder_event',
      claimDate,
      suggestedPayrollPeriodId,
      payload: { ...basePayload, bucketRole: 'indirect', siblingClaimId: directClaimId }
    });
    await poolConn.execute(
      `UPDATE payroll_time_claims SET bucket = 'indirect', credits_hours = ? WHERE id = ?`,
      [round2(indirectHours), indirectClaim.id]
    );
    indirectClaimId = indirectClaim.id;
  }

  if (directClaimId && indirectClaimId) {
    await PayrollTimeClaim.updatePayload({
      id: directClaimId,
      payload: { ...basePayload, bucketRole: 'direct', siblingClaimId: indirectClaimId }
    });
  }

  const linkClaimsOnPunches = async () => {
    try {
      await poolConn.execute(
        `UPDATE skill_builders_event_kiosk_punches
         SET payroll_time_claim_id = ?, payroll_indirect_claim_id = ?
         WHERE id IN (?, ?)`,
        [directClaimId, indirectClaimId, lastIn.id, punchOutId]
      );
    } catch (err) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
      const primaryId = directClaimId || indirectClaimId;
      await poolConn.execute(
        `UPDATE skill_builders_event_kiosk_punches SET payroll_time_claim_id = ? WHERE id IN (?, ?)`,
        [primaryId, lastIn.id, punchOutId]
      );
    }
  };

  await linkClaimsOnPunches();

  return {
    directClaimId,
    indirectClaimId,
    payrollTimeClaimId: directClaimId || indirectClaimId
  };
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} poolConn
 */
export async function recordSkillBuilderEventClockIn(poolConn, params) {
  const {
    agencyId,
    eventId,
    userId,
    sessionId,
    clientId,
    officeLocationId,
    source = 'portal'
  } = params;
  const aid = parsePositiveInt(agencyId);
  const eid = parsePositiveInt(eventId);
  const uid = parsePositiveInt(userId);
  if (!aid || !eid || !uid) {
    return { error: { status: 400, message: 'agencyId, eventId, and userId are required' } };
  }

  const sid = parsePositiveInt(sessionId);
  if (sid) {
    const [sr] = await poolConn.execute(
      `SELECT id FROM skill_builders_event_sessions WHERE id = ? AND company_event_id = ? LIMIT 1`,
      [sid, eid]
    );
    if (!sr?.[0]) {
      return { error: { status: 400, message: 'Invalid session for this event' } };
    }
  }

  const cid = parsePositiveInt(clientId);
  if (cid) {
    const okRoster = await clientOnSkillBuilderEventRoster(cid, eid, aid);
    if (!okRoster) {
      return { error: { status: 400, message: 'Client is not on this event roster' } };
    }
  }

  const onRoster = await providerOnEventStaffRoster(uid, eid, aid);
  if (!onRoster) {
    return { error: { status: 400, message: 'User is not on this event provider roster' } };
  }

  await maybeAutoClockOutStaleOpenPunch(poolConn, { agencyId: aid, eventId: eid, userId: uid, source });

  const [lastP] = await poolConn.execute(
    `SELECT punch_type FROM skill_builders_event_kiosk_punches
     WHERE company_event_id = ? AND user_id = ?
     ORDER BY punched_at DESC, id DESC LIMIT 1`,
    [eid, uid]
  );
  if (String(lastP?.[0]?.punch_type || '') === 'clock_in') {
    return { error: { status: 409, message: 'Already clocked in. Clock out first.' } };
  }

  const oid = parsePositiveInt(officeLocationId);
  const [ins] = await poolConn.execute(
    `INSERT INTO skill_builders_event_kiosk_punches
     (company_event_id, session_id, user_id, client_id, punch_type, punched_at, office_location_id)
     VALUES (?, ?, ?, ?, 'clock_in', NOW(), ?)`,
    [eid, sid || null, uid, cid || null, oid || null]
  );
  return { ok: true, punchId: ins.insertId };
}

/**
 * Event-station employee check-in (also used by portal backup).
 */
export async function recordEventEmployeeClockIn(poolConn, params) {
  const {
    agencyId,
    eventId,
    userId,
    sessionId,
    kioskDateYmd,
    officeLocationId,
    source = 'event_station'
  } = params;

  let sid = parsePositiveInt(sessionId);
  if (!sid && kioskDateYmd) {
    sid = await resolveSessionIdForKioskDate(poolConn, eventId, kioskDateYmd);
  }

  return recordSkillBuilderEventClockIn(poolConn, {
    agencyId,
    eventId,
    userId,
    sessionId: sid,
    officeLocationId,
    source
  });
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} poolConn
 */
export async function recordSkillBuilderEventClockOut(poolConn, params) {
  const agencyId = parsePositiveInt(params.agencyId);
  const eventId = parsePositiveInt(params.eventId);
  const userId = parsePositiveInt(params.userId);
  const source = params.source || 'portal';
  if (!agencyId || !eventId || !userId) {
    return { error: { status: 400, message: 'agencyId, eventId, and userId are required' } };
  }

  const clockOutAtRaw = params.clockOutAt != null ? new Date(params.clockOutAt) : null;
  const clockOutAt =
    clockOutAtRaw && Number.isFinite(clockOutAtRaw.getTime()) ? clockOutAtRaw : null;

  const onRoster = await providerOnEventStaffRoster(userId, eventId, agencyId);
  if (!onRoster) {
    return { error: { status: 400, message: 'User is not on this event provider roster' } };
  }

  const [inRows] = await poolConn.execute(
    `SELECT id, punched_at, client_id, session_id FROM skill_builders_event_kiosk_punches
     WHERE company_event_id = ? AND user_id = ? AND punch_type = 'clock_in'
     ORDER BY punched_at DESC LIMIT 1`,
    [eventId, userId]
  );
  const lastIn = inRows?.[0];
  if (!lastIn) return { error: { status: 400, message: 'No clock-in found' } };

  const [outCheck] = await poolConn.execute(
    `SELECT id FROM skill_builders_event_kiosk_punches
     WHERE company_event_id = ? AND user_id = ? AND punch_type = 'clock_out' AND punched_at >= ?
     LIMIT 1`,
    [eventId, userId, lastIn.punched_at]
  );
  if (outCheck?.[0]) {
    return { error: { status: 409, message: 'Already clocked out for this session' } };
  }

  const [evRows] = await poolConn.execute(
    `SELECT skill_builder_direct_hours FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1`,
    [eventId, agencyId]
  );
  const directConfigured = Number(evRows?.[0]?.skill_builder_direct_hours);
  const directHoursCap = Number.isFinite(directConfigured) && directConfigured > 0 ? directConfigured : 0;

  const tIn = new Date(lastIn.punched_at);
  const tOut = clockOutAt || new Date();
  const workedHours = Math.max(0, (tOut.getTime() - tIn.getTime()) / 3600000);
  const directHours = Math.min(directHoursCap, workedHours);
  const indirectHours = Math.max(0, workedHours - directHours);

  const outClientId = lastIn.client_id != null ? Number(lastIn.client_id) : null;
  const outSessionId = lastIn.session_id != null ? Number(lastIn.session_id) : null;

  const [insOut] = await poolConn.execute(
    `INSERT INTO skill_builders_event_kiosk_punches
     (company_event_id, session_id, user_id, client_id, punch_type, punched_at, office_location_id)
     VALUES (?, ?, ?, ?, 'clock_out', ?, NULL)`,
    [eventId, outSessionId || null, userId, outClientId, tOut]
  );

  const claims = await createSkillBuilderEventPayrollClaims(poolConn, {
    agencyId,
    eventId,
    userId,
    lastIn,
    punchOutId: insOut.insertId,
    tIn,
    tOut,
    workedHours,
    directHours,
    indirectHours,
    directHoursCap,
    outClientId,
    outSessionId,
    source
  });

  return {
    ok: true,
    punchOutId: insOut.insertId,
    payrollTimeClaimId: claims.payrollTimeClaimId,
    directClaimId: claims.directClaimId,
    indirectClaimId: claims.indirectClaimId,
    directHours: round2(directHours),
    indirectHours: round2(indirectHours),
    workedHours: round2(workedHours)
  };
}

/** Event-station employee check-out (also used by portal backup). */
export async function recordEventEmployeeClockOut(poolConn, params) {
  return recordSkillBuilderEventClockOut(poolConn, {
    ...params,
    source: params.source || 'event_station'
  });
}

function claimStatusFromRow(row) {
  return row?.status ? String(row.status) : null;
}

/**
 * Pair clock_in / clock_out punches for an event into payroll-ready rows.
 */
export async function listPairedEventProviderAttendance(eventId, { userId = null, agencyId = null } = {}) {
  const eid = parsePositiveInt(eventId);
  if (!eid) return [];

  const params = [eid];
  let userFilter = '';
  const uid = parsePositiveInt(userId);
  if (uid) {
    userFilter = ' AND p.user_id = ?';
    params.push(uid);
  }

  let rows = [];
  try {
    [rows] = await pool.execute(
      `SELECT p.id, p.user_id, p.punch_type, p.punched_at, p.session_id,
              p.payroll_time_claim_id, p.payroll_indirect_claim_id,
              u.first_name, u.last_name
       FROM skill_builders_event_kiosk_punches p
       INNER JOIN users u ON u.id = p.user_id
       WHERE p.company_event_id = ?${userFilter}
       ORDER BY p.user_id ASC, p.punched_at ASC, p.id ASC`,
      params
    );
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    if (err?.code === 'ER_BAD_FIELD_ERROR') {
      [rows] = await pool.execute(
        `SELECT p.id, p.user_id, p.punch_type, p.punched_at, p.session_id,
                p.payroll_time_claim_id, NULL AS payroll_indirect_claim_id,
                u.first_name, u.last_name
         FROM skill_builders_event_kiosk_punches p
         INNER JOIN users u ON u.id = p.user_id
         WHERE p.company_event_id = ?${userFilter}
         ORDER BY p.user_id ASC, p.punched_at ASC, p.id ASC`,
        params
      );
    } else {
      throw err;
    }
  }
  const claimIds = new Set();
  for (const p of rows) {
    if (p.payroll_time_claim_id) claimIds.add(Number(p.payroll_time_claim_id));
    if (p.payroll_indirect_claim_id) claimIds.add(Number(p.payroll_indirect_claim_id));
  }

  const claimById = new Map();
  if (claimIds.size) {
    const ph = [...claimIds].map(() => '?').join(',');
    const [claimRows] = await pool.execute(
      `SELECT id, status, bucket, credits_hours, target_payroll_period_id FROM payroll_time_claims WHERE id IN (${ph})`,
      [...claimIds]
    );
    for (const c of claimRows || []) {
      claimById.set(Number(c.id), c);
    }
  }

  let directHoursCap = 0;
  if (agencyId) {
    const [evRows] = await pool.execute(
      `SELECT skill_builder_direct_hours FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1`,
      [eid, agencyId]
    );
    const configured = Number(evRows?.[0]?.skill_builder_direct_hours);
    directHoursCap = Number.isFinite(configured) && configured > 0 ? configured : 0;
  }

  const openByUser = new Map();
  const paired = [];

  for (const p of rows) {
    const punchType = String(p.punch_type || '').toLowerCase();
    const uidKey = Number(p.user_id);
    if (punchType === 'clock_in') {
      openByUser.set(uidKey, p);
      continue;
    }
    if (punchType !== 'clock_out') continue;

    const inPunch = openByUser.get(uidKey);
    openByUser.delete(uidKey);

    const tIn = inPunch ? new Date(inPunch.punched_at) : null;
    const tOut = new Date(p.punched_at);
    const workedHours = tIn && Number.isFinite(tIn.getTime())
      ? Math.max(0, (tOut.getTime() - tIn.getTime()) / 3600000)
      : 0;
    const directHours = Math.min(directHoursCap, workedHours);
    const indirectHours = Math.max(0, workedHours - directHours);

    const directClaim = claimById.get(Number(p.payroll_time_claim_id || inPunch?.payroll_time_claim_id));
    const indirectClaim = claimById.get(Number(p.payroll_indirect_claim_id || inPunch?.payroll_indirect_claim_id));

    paired.push({
      userId: uidKey,
      providerName: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      clockInAt: inPunch?.punched_at || null,
      clockOutAt: p.punched_at,
      workedHours: round2(workedHours),
      directHours: round2(directHours),
      indirectHours: round2(indirectHours),
      directHoursCap: round2(directHoursCap),
      sessionId: p.session_id != null ? Number(p.session_id) : (inPunch?.session_id != null ? Number(inPunch.session_id) : null),
      punchInId: inPunch ? Number(inPunch.id) : null,
      punchOutId: Number(p.id),
      directClaimId: directClaim ? Number(directClaim.id) : (p.payroll_time_claim_id ? Number(p.payroll_time_claim_id) : null),
      indirectClaimId: indirectClaim ? Number(indirectClaim.id) : (p.payroll_indirect_claim_id ? Number(p.payroll_indirect_claim_id) : null),
      directClaimStatus: claimStatusFromRow(directClaim),
      indirectClaimStatus: claimStatusFromRow(indirectClaim),
      source: 'kiosk_punch'
    });
  }

  for (const [uidKey, inPunch] of openByUser) {
    paired.push({
      userId: uidKey,
      providerName: `${inPunch.first_name || ''} ${inPunch.last_name || ''}`.trim(),
      clockInAt: inPunch.punched_at,
      clockOutAt: null,
      workedHours: null,
      directHours: null,
      indirectHours: null,
      directHoursCap: round2(directHoursCap),
      sessionId: inPunch.session_id != null ? Number(inPunch.session_id) : null,
      punchInId: Number(inPunch.id),
      punchOutId: null,
      directClaimId: null,
      indirectClaimId: null,
      directClaimStatus: null,
      indirectClaimStatus: null,
      source: 'kiosk_punch'
    });
  }

  return paired;
}
