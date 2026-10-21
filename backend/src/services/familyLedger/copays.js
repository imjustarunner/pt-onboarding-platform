import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { billingError } from '../familyBillingPolicy.service.js';
import { getReadiness } from './readiness.js';
import { sourcePayload } from './receivables.js';
import { dateOnly, today } from './policy.js';
import { payAllocation } from './payments.js';
import { isGuardianTestAccountId } from '../guardianTestAccess.service.js';

// Called again inside the locked payment transaction, not just by the scheduler.
export async function assertAutomaticCopay(receivable, allocation, db=pool) {
  const profile=await getReadiness(receivable.agency_id,receivable.client_id,db),payload=sourcePayload(receivable);
  if(profile.setup_status!=='ready'||profile.collection_policy==='manual'||!profile.automatic_from||new Date(receivable.created_at)<new Date(profile.automatic_from))throw billingError(409,'Automatic billing is not enabled for this balance');
  if(!['claim_responsibility','clinical_copay'].includes(receivable.source_type)||payload.responsibilityType!=='copay'||!payload.serviceCompleted||!receivable.service_date||dateOnly(receivable.service_date)>today())throw billingError(409,'Only a verified completed-visit copay can be collected automatically');
  if(profile.collection_policy==='after_era'&&payload.verificationBasis!=='era')throw billingError(409,'This client waits for verified payer responsibility');
  const [plans]=await db.execute("SELECT id FROM family_payment_plans WHERE allocation_id=? AND status IN ('proposed','active') LIMIT 1",[allocation.id]);
  if(plans.length)throw billingError(409,'This balance follows its payment plan');
  if(receivable.source_type==='clinical_copay'||payload.attendanceSessionId){
    const {attendanceCopaysEnabled,assertAttendanceCopay,attendanceCopayTerms,assertSameDayCopay}=await import('./copayAttendance.js');
    if(!await attendanceCopaysEnabled(receivable.agency_id,db))throw billingError(409,'Attendance copay collection is paused');
    await assertAttendanceCopay(receivable,db);
    const [[session]]=await clinicalPool.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?',[payload.attendanceSessionId||receivable.source_key,receivable.agency_id,receivable.client_id]);
    if(!session)throw billingError(409,'The session is unavailable');
    const current=await attendanceCopayTerms(session,db);
    assertSameDayCopay(session,current.timezone);
    if(Number(current.payerUserId)!==Number(allocation.payer_user_id)||Number(current.term.totalCents)!==Number(allocation.amount_cents))throw billingError(409,'The current signed copay differs from this balance');
    if(receivable.source_type==='clinical_copay')return;
  }
  const [claims]=await clinicalPool.execute("SELECT s.* FROM clinical_claims c JOIN clinical_sessions s ON s.id=c.clinical_session_id AND s.agency_id=c.agency_id AND s.client_id=c.client_id WHERE c.id=? AND c.agency_id=? AND c.client_id=? AND c.is_deleted=0 AND s.encounter_status='completed'",[receivable.source_key,receivable.agency_id,receivable.client_id]);
  if(!claims.length)throw billingError(409,'The visit changed; review its copay before collection');
  const [[agency]]=await db.execute('SELECT timezone FROM agencies WHERE id=?',[receivable.agency_id]);
  const {assertSameDayCopay}=await import('./copayAttendance.js');
  assertSameDayCopay(claims[0],agency?.timezone||'America/Denver');
}
// Recheck immediately before creating a new processor intent. Reconciliation
// of an already-created intent is read-only and must remain possible later.
export async function assertAutomaticCopayDispatchDate({agencyId,allocationId},db=pool,clinical=clinicalPool) {
  const [[row]]=await db.execute('SELECT r.*,a.timezone FROM family_receivable_allocations p JOIN family_receivables r ON r.id=p.receivable_id AND r.agency_id=p.agency_id JOIN agencies a ON a.id=r.agency_id WHERE p.id=? AND p.agency_id=?',[allocationId,agencyId]);
  if(!row)throw billingError(409,'The balance is unavailable for collection.');
  const payload=sourcePayload(row);let sessions;
  if(row.source_type==='clinical_copay'||payload.attendanceSessionId){
    [sessions]=await clinical.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?',[payload.attendanceSessionId||row.source_key,agencyId,row.client_id]);
  }else{
    [sessions]=await clinical.execute('SELECT s.* FROM clinical_claims c JOIN clinical_sessions s ON s.id=c.clinical_session_id AND s.agency_id=c.agency_id AND s.client_id=c.client_id WHERE c.id=? AND c.agency_id=? AND c.client_id=? AND c.is_deleted=0',[row.source_key,agencyId,row.client_id]);
  }
  if(!sessions?.[0])throw billingError(409,'The scheduled session is unavailable for collection.');
  const {assertSameDayCopay}=await import('./copayAttendance.js');
  assertSameDayCopay(sessions[0],row.timezone||'America/Denver');
}
export async function runDueCopays({agencyId}) {
  const [rows]=await pool.execute(`SELECT a.id,a.payer_user_id,a.amount_cents-a.paid_cents AS due FROM family_receivable_allocations a JOIN family_receivables r ON r.id=a.receivable_id JOIN client_billing_readiness b ON b.agency_id=r.agency_id AND b.client_id=r.client_id WHERE r.agency_id=? AND r.source_type='claim_responsibility' AND r.status='open' AND r.hold_reason IS NULL AND r.disputed_at IS NULL AND r.due_date<=CURRENT_DATE AND a.amount_cents>a.paid_cents AND a.payer_user_id IS NOT NULL AND b.setup_status='ready' AND b.collection_policy<>'manual' AND r.created_at>=b.automatic_from ORDER BY r.due_date,a.id LIMIT 100`,[agencyId]);
  const results=[];
  for(const row of rows)try {
    if(await isGuardianTestAccountId(row.payer_user_id))continue;
    results.push({allocationId:row.id,...await payAllocation({agencyId,userId:row.payer_user_id,allocationId:row.id,amountCents:Number(row.due),idempotencyKey:`automatic-copay:${agencyId}:${row.id}`,automatic:true})});
  } catch(e) { results.push({allocationId:row.id,paid:false,message:e.status?e.message:'Payment needs reconciliation'}); }
  return results;
}
