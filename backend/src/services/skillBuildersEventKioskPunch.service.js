import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';

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

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export async function recordSkillBuilderEventClockIn(poolConn, params) {
  const {
    agencyId,
    eventId,
    userId,
    sessionId,
    clientId,
    officeLocationId
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

  const onRoster = await providerOnSkillBuilderEventRoster(uid, eid, aid);
  if (!onRoster) {
    return { error: { status: 400, message: 'User is not on this event provider roster' } };
  }

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
 * @param {import('mysql2/promise').Pool} pool
 */
export async function recordSkillBuilderEventClockOut(poolConn, params) {
  const agencyId = parsePositiveInt(params.agencyId);
  const eventId = parsePositiveInt(params.eventId);
  const userId = parsePositiveInt(params.userId);
  if (!agencyId || !eventId || !userId) {
    return { error: { status: 400, message: 'agencyId, eventId, and userId are required' } };
  }

  const onRoster = await providerOnSkillBuilderEventRoster(userId, eventId, agencyId);
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
  const directHours = Number.isFinite(directConfigured) && directConfigured > 0 ? directConfigured : 0;

  const tIn = new Date(lastIn.punched_at);
  const tOut = new Date();
  const workedHours = Math.max(0, (tOut.getTime() - tIn.getTime()) / 3600000);
  const indirectHours = Math.max(0, workedHours - directHours);

  const outClientId = lastIn.client_id != null ? Number(lastIn.client_id) : null;
  const outSessionId = lastIn.session_id != null ? Number(lastIn.session_id) : null;

  const [insOut] = await poolConn.execute(
    `INSERT INTO skill_builders_event_kiosk_punches
     (company_event_id, session_id, user_id, client_id, punch_type, punched_at, office_location_id)
     VALUES (?, ?, ?, ?, 'clock_out', NOW(), NULL)`,
    [eventId, outSessionId || null, userId, outClientId]
  );

  const claimDate = tOut.toISOString().slice(0, 10);
  const [pRows] = await poolConn.execute(
    `SELECT id FROM payroll_periods
     WHERE agency_id = ? AND period_start <= ? AND period_end >= ?
     ORDER BY period_end ASC LIMIT 1`,
    [agencyId, claimDate, claimDate]
  );
  const suggestedPayrollPeriodId = pRows?.[0]?.id ? Number(pRows[0].id) : null;

  const claim = await PayrollTimeClaim.create({
    agencyId,
    userId,
    submittedByUserId: userId,
    status: 'submitted',
    claimType: 'skill_builder_event',
    claimDate,
    suggestedPayrollPeriodId,
    payload: {
      companyEventId: eventId,
      companyEventSessionId: lastIn.session_id != null ? Number(lastIn.session_id) : null,
      clientId: outClientId,
      clockInAt: lastIn.punched_at,
      clockOutAt: tOut.toISOString(),
      workedHours: Math.round(workedHours * 100) / 100,
      directHours: Math.round(directHours * 100) / 100,
      indirectHours: Math.round(indirectHours * 100) / 100,
      kioskPunchInId: lastIn.id,
      kioskPunchOutId: insOut.insertId
    }
  });

  await poolConn.execute(
    `UPDATE skill_builders_event_kiosk_punches SET payroll_time_claim_id = ? WHERE id IN (?, ?)`,
    [claim.id, lastIn.id, insOut.insertId]
  );

  return {
    ok: true,
    punchOutId: insOut.insertId,
    payrollTimeClaimId: claim.id,
    directHours,
    indirectHours,
    workedHours: Math.round(workedHours * 100) / 100
  };
}
