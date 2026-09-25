import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { billingError, positiveId, requireResponsiblePayer } from '../familyBillingPolicy.service.js';
import { decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { readClientInsurance } from '../clientInsurance.service.js';
import { assertReady, getReadiness } from './readiness.js';
import { assertServiceTermsCurrent } from './serviceRates.js';
import { transaction, dateOnly, today } from './policy.js';
import { createReceivable } from './receivables.js';
import { setClaimResponsibility } from './sources.js';

export async function signedServiceTerm({ agencyId, taskId, clientId, serviceCode }, db = pool) {
  const [rows] = await db.execute("SELECT * FROM family_billing_tasks WHERE id=? AND agency_id=? AND status='completed'", [positiveId(taskId),positiveId(agencyId)]);
  const task = rows[0];
  if (!task?.signed_evidence_encrypted) throw billingError(409, 'The payer must complete and sign this payment task first');
  const evidence = decryptFamilyBilling(task.signed_evidence_encrypted, `billing-task:${agencyId}:${task.guardian_user_id}`);
  const term = evidence.waiver?.serviceTerms?.find(t => Number(t.clientId) === positiveId(clientId) && t.serviceCode === serviceCode);
  if (!term) throw billingError(409, 'The signed task does not cover this client and service');
  await requireResponsiblePayer(task.guardian_user_id,clientId,agencyId,db);
  await assertServiceTermsCurrent([term],agencyId,db);
  return { term, payerUserId: Number(task.guardian_user_id) };
}
export function assertTermVisit(term, session) {
  const date = session.scheduled_start_at ? dateOnly(session.scheduled_start_at) : null;
  if (session.encounter_status !== 'completed' || !date || date > today()) throw billingError(409, 'Only a completed visit can create a service balance');
  if (date < term.effectiveFrom || date > term.effectiveThrough) throw billingError(409, 'This visit is outside the signed price dates');
  const code = session.effective_service_code || session.service_code;
  if (code !== term.serviceCode || (term.priceBasis === 'unit' && Number(session.billed_units) !== term.units)) throw billingError(409, 'The visit code or units differ from the signed terms. Review the service before billing.');
  return date;
}
export async function listSignedServiceVisits(input) {
  const {term} = await signedServiceTerm(input);
  const args = [input.agencyId,input.clientId,term.effectiveFrom,term.effectiveThrough,term.serviceCode];
  const [rows] = await clinicalPool.execute(`SELECT s.id,s.scheduled_start_at,s.encounter_status,s.service_code,s.effective_service_code,s.billed_units${term.paymentBasis==='copay'?',c.id AS claim_id':''}
    FROM clinical_sessions s ${term.paymentBasis==='copay'?"JOIN clinical_claims c ON c.clinical_session_id=s.id AND c.agency_id=s.agency_id AND c.client_id=s.client_id AND c.is_deleted=0 AND c.claim_lifecycle<>'void' AND c.payer_sequence=1":''}
    WHERE s.agency_id=? AND s.client_id=? AND s.scheduled_start_at>=? AND s.scheduled_start_at<DATE_ADD(?,INTERVAL 1 DAY)
    AND COALESCE(NULLIF(s.effective_service_code,''),s.service_code)=? AND s.encounter_status='completed'
    ORDER BY s.scheduled_start_at DESC,s.id DESC LIMIT 100`,args);
  const visits=[];
  for(const row of rows) {
    try {const serviceDate=assertTermVisit(term,row);if(term.paymentBasis==='self_pay')await assertNoInsuranceClaim(input.agencyId,row.id);
      visits.push({sessionId:row.id,claimId:row.claim_id||null,serviceDate,serviceCode:term.serviceCode,units:Number(row.billed_units||1),amountCents:term.totalCents});
    }catch(e){if(e.status!==409)throw e;}
  }
  return visits;
}
export async function postSignedService({ agencyId, clientId, taskId, sessionId, claimId, serviceCode, actorUserId }) {
  const { term, payerUserId } = await signedServiceTerm({agencyId,clientId,taskId,serviceCode});
  if (term.paymentBasis === 'copay') {
    const [rows] = await clinicalPool.execute('SELECT s.* FROM clinical_claims c JOIN clinical_sessions s ON s.id=c.clinical_session_id AND s.agency_id=c.agency_id AND s.client_id=c.client_id WHERE c.id=? AND c.agency_id=? AND c.client_id=? AND c.is_deleted=0', [positiveId(claimId),agencyId,clientId]);
    if (!rows[0]) throw billingError(404, 'Claim not found for this client');
    assertTermVisit(term,rows[0]);
    return setClaimResponsibility({agencyId,clientId,claimId,amountCents:term.totalCents,responsibilityType:'copay',verificationBasis:'benefit',reason:`Signed service authorization ${taskId}. ${term.evidence}`,actorUserId});
  }
  // Shared with claim submission: serialize self-pay creation against transmission.
  const clinical = await clinicalPool.getConnection();
  try {
    await clinical.beginTransaction();
    const [rows] = await clinical.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=? FOR UPDATE', [positiveId(sessionId),agencyId,clientId]);
    if (!rows[0]) throw billingError(404, 'Visit not found for this client');
    const serviceDate = assertTermVisit(term,rows[0]);
    await assertNoInsuranceClaim(agencyId,sessionId,clinical);
    const result = await transaction(async db => {
      await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[clientId,agencyId]);
      await signedServiceTerm({agencyId,clientId,taskId,serviceCode},db);
      const insurance = await readClientInsurance(clientId,agencyId,db), readiness = await getReadiness(agencyId,clientId,db);
      assertReady(readiness,insurance);
      if (readiness.coverage_mode !== 'self_pay') throw billingError(409, 'Confirm explicitly agreed self-pay in client billing readiness first');
      return createReceivable({agencyId,clientId,sourceType:'clinical_self_pay',sourceKey:String(sessionId),serviceDomain:'mental_health',
        serviceLabel:`Service ${term.serviceCode}`,serviceDate,amountCents:term.totalCents,insuranceReviewed:true,actorUserId,
        shares:[{payerUserId,basisPoints:10000}],payload:{serviceTerm:term,authorizationTaskId:Number(taskId),responsibilityType:'self_pay',serviceCompleted:true}},db);
    });
    await clinical.commit();
    return result;
  } catch (e) { await clinical.rollback(); throw e; } finally { clinical.release(); }
}
async function assertNoInsuranceClaim(agencyId, sessionId, db = clinicalPool) {
  const [claims] = await db.execute("SELECT id FROM clinical_claims WHERE agency_id=? AND clinical_session_id=? AND is_deleted=0 AND claim_lifecycle<>'void' LIMIT 1", [agencyId,sessionId]);
  if (claims.length) throw billingError(409, 'This visit has an insurance claim. Reconcile it before creating or collecting self-pay.');
}
export async function assertSelfPayVisit(receivable) {
  const payload = decryptFamilyBilling(receivable.source_payload,`receivable:${receivable.agency_id}:${receivable.client_id}`);
  const [sessions] = await clinicalPool.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?', [receivable.source_key,receivable.agency_id,receivable.client_id]);
  if (!sessions[0] || !payload.serviceTerm) throw billingError(409,'The self-pay visit needs billing review');
  assertTermVisit(payload.serviceTerm,sessions[0]);
  await assertNoInsuranceClaim(receivable.agency_id,receivable.source_key);
}
export async function assertNoSelfPayBalance(agencyId, sessionId) {
  const [rows] = await pool.execute("SELECT id FROM family_receivables WHERE agency_id=? AND source_type='clinical_self_pay' AND source_key=? AND status<>'void' LIMIT 1",[agencyId,String(sessionId)]);
  if (rows.length) throw billingError(409,'A self-pay balance exists for this visit. Reconcile it before submitting an insurance claim.');
}
