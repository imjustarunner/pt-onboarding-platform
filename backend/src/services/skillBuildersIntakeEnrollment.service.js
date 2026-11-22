import { eventRegistrationPrice, registrationSessionCountSql, requireRegistrationAudience } from './registrationServiceAudience.service.js';
import pool from '../config/database.js';
import { ensureCompanyEventClientEnrollment } from './companyEventClientEnrollmentSync.service.js';

export function validatePayerForEligibility(payerType, row) {
  const pt = String(payerType || '').trim().toLowerCase();
  if (!pt) return Number(row?.medicaid_eligible) || Number(row?.cash_eligible)
    ? { ok: false, message: 'Select a payment or coverage option for this registration' } : { ok: true };
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
 * The event and optional skills-group rosters are the program assignments.
 */
export async function enrollClientsInCompanyEvent({ agencyId, eventId, clientIds, payerType, skipRegistrationCheck = false, actorUserId = null, paidOrder = false, allowCheckout = false, expectedPriceCents = null }) {
  const aid = Number(agencyId);
  const eid = Number(eventId);
  const ids = (Array.isArray(clientIds) ? clientIds : [])
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  const results = [];
  if (!aid || !eid || !ids.length) {
    return { ok: false, results, error: 'agencyId, eventId, and clientIds are required' };
  }

  for (const clientId of [...new Set(ids)]) {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const [[event]] = await db.execute(`SELECT ce.id, ce.title, registration_eligible, medicaid_eligible, cash_eligible,
        registration_audience, is_active, ends_at, recurrence_json, program_cost_billing_mode, program_cost_dollars, per_session_cost_dollars,
        (ends_at IS NOT NULL AND ends_at < NOW() AND ${registrationSessionCountSql}=0) AS ended,
        ${registrationSessionCountSql} AS remaining_sessions FROM company_events ce WHERE ce.id=? AND ce.agency_id=? FOR SHARE`,[eid,aid]);
      if (!event) throw Object.assign(new Error('Event not found'),{status:404});
      if (Number(event.is_active ?? 1) !== 1 || Number(event.ended) || (!skipRegistrationCheck && !Number(event.registration_eligible))) {
        throw Object.assign(new Error('This event is not open for registration'),{status:409});
      }
      const [[client]] = await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[clientId,aid]);
      if (!client) throw Object.assign(new Error('Client not in this agency'),{status:403});
      const payer = validatePayerForEligibility(payerType,event);
      if (!payer.ok) throw Object.assign(new Error(payer.message),{status:400});
      await requireRegistrationAudience(event,clientId,aid,db);
      const [[existing]] = await db.execute('SELECT is_active FROM company_event_clients WHERE company_event_id=? AND agency_id=? AND client_id=?',[eid,aid,clientId]);
      const quote = eventRegistrationPrice(event);
      if (!Number(existing?.is_active) && quote.unitCents>0 && !paidOrder && payerType !== 'medicaid') {
        if (!quote.sessionCount) throw Object.assign(new Error('Session dates must be published before payment.'),{status:409});
        if (allowCheckout && Number(expectedPriceCents)!==quote.priceCents) {
          throw Object.assign(new Error('The registration price changed. Refresh the catalog before confirming.'),{status:409});
        }
        if (!allowCheckout || payerType !== 'cash' || !Number(event.cash_eligible)) {
          throw Object.assign(new Error('Complete payment for this registration through Billing.'), {status:402});
        }
        const { createRegistrationOrder } = await import('./registrationPayments.service.js');
        const order = await createRegistrationOrder({db, agencyId:aid, clientId, actorUserId, offering:event, kind:'event'});
        await db.commit();
        results.push({clientId, ok:true, ...order});
        continue;
      }
      const [[group]] = await db.execute('SELECT id FROM skills_groups WHERE company_event_id=? AND agency_id=? LIMIT 1',[eid,aid]);
      if (group) {
        await db.execute(`INSERT INTO skills_group_clients
          (skills_group_id,client_id,active_for_providers,ready_confirmed_by_user_id,ready_confirmed_at)
          VALUES (?,?,0,NULL,NULL) ON DUPLICATE KEY UPDATE skills_group_id=VALUES(skills_group_id)`,[group.id,clientId]);
      }
      await ensureCompanyEventClientEnrollment({eventId:eid,agencyId:aid,clientId,actorUserId,db});
      await db.commit();
      results.push({clientId,ok:true});
    } catch (error) {
      await db.rollback();
      if (!error.status) throw error;
      results.push({clientId,ok:false,error:error.message});
    } finally {
      db.release();
    }
  }
  return {ok:results.some(result=>result.ok),results,...(results.every(result=>!result.ok) ? {error:results[0]?.error} : {})};
}
