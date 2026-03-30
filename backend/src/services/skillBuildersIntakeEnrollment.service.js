import pool from '../config/database.js';

export function validatePayerForEligibility(payerType, row) {
  const pt = String(payerType || '').trim().toLowerCase();
  if (!pt) return { ok: true };
  const med = row?.medicaid_eligible === 1 || row?.medicaid_eligible === true;
  const cash = row?.cash_eligible === 1 || row?.cash_eligible === true;
  if (pt === 'medicaid' && !med) {
    return { ok: false, message: 'This offering is not open for Medicaid enrollment' };
  }
  if (pt === 'cash' && !cash) {
    return { ok: false, message: 'This offering is not open for cash/self-pay enrollment' };
  }
  if (pt !== 'medicaid' && pt !== 'cash') {
    return { ok: false, message: 'payerType must be medicaid, cash, or omitted' };
  }
  return { ok: true };
}

/**
 * Enroll clients into a Skill Builders company_event (skills_group_clients).
 * Same rules as guardian portal enrollment (school affiliation, registration flags).
 */
export async function enrollClientsInCompanyEvent({ agencyId, eventId, clientIds, payerType }) {
  const aid = Number(agencyId);
  const eid = Number(eventId);
  const ids = (Array.isArray(clientIds) ? clientIds : [])
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  const results = [];
  if (!aid || !eid || !ids.length) {
    return { ok: false, results, error: 'agencyId, eventId, and clientIds are required' };
  }

  const [evRows] = await pool.execute(
    `SELECT id, agency_id, registration_eligible, medicaid_eligible, cash_eligible
     FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1`,
    [eid, aid]
  );
  const ev = evRows?.[0];
  if (!ev) {
    return { ok: false, results, error: 'Event not found' };
  }
  if (!(ev.registration_eligible === 1 || ev.registration_eligible === true)) {
    return { ok: false, results, error: 'This event is not open for registration' };
  }
  const payerCheck = validatePayerForEligibility(payerType, ev);
  if (!payerCheck.ok) {
    return { ok: false, results, error: payerCheck.message };
  }

  const [sgRows] = await pool.execute(
    `SELECT sg.id, sg.organization_id FROM skills_groups sg
     WHERE sg.company_event_id = ? AND sg.agency_id = ? LIMIT 1`,
    [eid, aid]
  );
  const sg = sgRows?.[0];
  if (!sg) {
    return { ok: false, results, error: 'Program is not linked to this event yet' };
  }

  const schoolOrgId = Number(sg.organization_id);
  for (const clientId of ids) {
    const [cur] = await pool.execute(`SELECT id, agency_id FROM clients WHERE id = ? LIMIT 1`, [clientId]);
    const cl = cur?.[0];
    if (!cl || Number(cl.agency_id) !== aid) {
      results.push({ clientId, ok: false, error: 'Client not in this agency' });
      continue;
    }
    const [coa] = await pool.execute(
      `SELECT 1 FROM client_organization_assignments
       WHERE client_id = ? AND organization_id = ? AND is_active = TRUE LIMIT 1`,
      [clientId, schoolOrgId]
    );
    if (!coa?.[0]) {
      results.push({ clientId, ok: false, error: 'Client must be affiliated with the event school' });
      continue;
    }
    try {
      await pool.execute(
        `INSERT INTO skills_group_clients
          (skills_group_id, client_id, active_for_providers, ready_confirmed_by_user_id, ready_confirmed_at)
         VALUES (?, ?, 0, NULL, NULL)
         ON DUPLICATE KEY UPDATE skills_group_id = skills_group_id`,
        [sg.id, clientId]
      );
      results.push({ clientId, ok: true });
    } catch (err) {
      results.push({ clientId, ok: false, error: err?.message || 'Enroll failed' });
    }
  }

  return { ok: true, results };
}
