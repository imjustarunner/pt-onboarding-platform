import pool from '../../config/database.js';
import { billingError, auditBilling, requireResponsiblePayer } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { findReceivable, allocationsFor, sourcePayload } from './receivables.js';
import { transaction, assertCollectible, allocationDue, dateOnly } from './policy.js';

export async function queueReceiptEvent({agencyId,paymentId,kind,eventKey},db=pool) {
  await db.execute('INSERT IGNORE INTO family_receipt_deliveries (agency_id,payment_id,kind,event_key) VALUES (?,?,?,?)',[agencyId,paymentId,kind,eventKey]);
}

/** Called with the client/receivable locks held. In-flight payments still need
 * reconciliation; a confirmed successful payment must not block a correction. */
export async function holdCancelledCopay(receivableId,agencyId,db,{checkOnly=false,sessionId=null}={}) {
  const row=await findReceivable(agencyId,receivableId,db,true);
  const [pending]=await db.execute("SELECT p.id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? AND p.status IN ('pending','requires_action','unknown') LIMIT 1",[receivableId]);
  if(pending.length)throw billingError(409,'A copay payment is still processing. Billing must reconcile it before completing this appointment change.');
  if(!checkOnly&&row.status!=='void')await db.execute("UPDATE family_receivables SET status='review',hold_reason='attendance_not_occurred' WHERE id=? AND agency_id=?",[receivableId,agencyId]);
  if(!checkOnly&&sessionId){
    const payload=sourcePayload(row);
    if(payload.attendanceSessionId&&Number(payload.attendanceSessionId)!==Number(sessionId))throw billingError(409,'This balance is linked to a different session.');
    await db.execute('UPDATE family_receivables SET source_payload=? WHERE id=?',[encryptFamilyBilling({...payload,attendanceSessionId:Number(sessionId)},`receivable:${agencyId}:${row.client_id}`),row.id]);
  }
}

/** Release funds only after the chart's non-occurrence is finalized. The worker
 * retries this idempotently if chart and application databases commit separately. */
export async function creditCancelledSession({agencyId,clientId,sessionId,actorUserId}) {
  const clinical=(await import('../../config/clinicalDatabase.js')).default;
  const [[session]]=await clinical.execute("SELECT id,scheduled_start_at FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=? AND encounter_status IN ('cancelled','canceled','no_show')",[sessionId,agencyId,clientId]);
  if(!session)return {awaitingDocumentation:true};
  const [claims]=await clinical.execute('SELECT id,parent_claim_id FROM clinical_claims WHERE agency_id=? AND clinical_session_id=? AND client_id=?',[agencyId,sessionId,clientId]);
  const claimKeys=new Set(claims.map(c=>String(c.parent_claim_id||c.id)));
  return transaction(async db=>{
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[clientId,agencyId]);
    const [rows]=await db.execute("SELECT * FROM family_receivables WHERE agency_id=? AND client_id=? AND (source_type='clinical_copay' AND source_key=? OR source_type='claim_responsibility') ORDER BY id FOR UPDATE",[agencyId,clientId,String(sessionId)]);
    for(const row of rows){
      const payload=sourcePayload(row);
      const linked=Number(payload.attendanceSessionId||(row.source_type==='clinical_copay'?row.source_key:0))===Number(sessionId)||row.source_type==='claim_responsibility'&&claimKeys.has(String(row.source_key));
      if(payload.responsibilityType!=='copay'||!linked)continue;
      await holdCancelledCopay(row.id,agencyId,db);
      // A canceled destination returns any earlier credit to its original pool.
      const allocations=await allocationsFor(row.id,db,true);
      for(const allocation of allocations){
        const [incoming]=await db.execute("SELECT * FROM family_copay_credit_applications WHERE allocation_id=? AND status='applied' ORDER BY id FOR UPDATE",[allocation.id]);
        for(const application of incoming)await reverseApplication(application,db);
      }
      const [payments]=await db.execute("SELECT p.* FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? AND p.status='succeeded' AND p.processor IN ('STRIPE','CASH') ORDER BY p.id FOR UPDATE",[row.id]);
      for(const payment of payments){
        const [inserted]=await db.execute('INSERT IGNORE INTO family_copay_credits (payment_id,agency_id,client_id,payer_user_id,service_date,service_at) VALUES (?,?,?,?,?,?)',[payment.id,agencyId,clientId,payment.payer_user_id,dateOnly(row.service_date),session.scheduled_start_at]);
        if(inserted.affectedRows){
          await queueReceiptEvent({agencyId,paymentId:payment.id,kind:'credit_available',eventKey:`cancel-credit:${payment.id}`},db);
          await auditBilling({agencyId,clientId,userId:actorUserId,action:'cancelled_copay_credit_available',objectId:payment.id},db);
        }
      }
      if(!payload.cancelledCopayCredit){
        await db.execute("UPDATE family_receivables SET status='void',hold_reason='cancelled_copay_credit',source_payload=? WHERE id=?",[encryptFamilyBilling({...payload,cancelledCopayCredit:true,serviceCompleted:false},`receivable:${agencyId}:${clientId}`),row.id]);
        await db.execute("UPDATE family_payment_plans p JOIN family_receivable_allocations a ON a.id=p.allocation_id SET p.status='cancelled',p.auto_pay=0 WHERE a.receivable_id=? AND p.status IN ('proposed','active')",[row.id]);
      }
    }
  });
}

export async function paymentCreditState(paymentId,db=pool) {
  const [[row]]=await db.execute(`SELECT p.amount_cents,r.disputed_at,
    EXISTS(SELECT 1 FROM family_copay_credits c WHERE c.payment_id=p.id) AS is_credit,
    COALESCE((SELECT SUM(f.amount_cents) FROM family_payment_refunds f WHERE f.payment_id=p.id AND f.status IN ('pending','unknown','succeeded')),0) AS refunds,
    COALESCE((SELECT SUM(a.amount_cents) FROM family_copay_credit_applications a WHERE a.payment_id=p.id AND a.status='applied'),0) AS applied,
    EXISTS(SELECT 1 FROM family_payment_refund_requests r WHERE r.payment_id=p.id AND r.status IN ('requested','processing','review')) AS refund_requested
    FROM family_ledger_payments p JOIN family_receivable_allocations original_allocation ON original_allocation.id=p.allocation_id
    JOIN family_receivables r ON r.id=original_allocation.receivable_id WHERE p.id=?`,[paymentId]);
  if(!row)return null;
  return {isCredit:!!row.is_credit,appliedCents:Number(row.applied),availableCents:row.is_credit&&!row.refund_requested&&!row.disputed_at?Math.max(0,Number(row.amount_cents)-Number(row.refunds)-Number(row.applied)):0,refundRequested:!!row.refund_requested,billingReview:!!row.disputed_at};
}

/** All writers lock the client first, so credit applications, refund requests
 * and charge preparation cannot spend the same funds concurrently. */
export async function applyCopayCreditsLocked(receivable,allocation,db) {
  if(!allocation.payer_user_id||receivable.status!=='open')return 0;
  const payload=sourcePayload(receivable);
  if(payload.responsibilityType!=='copay'||!payload.serviceCompleted||!receivable.service_date)return 0;
  await assertCollectible(receivable,db);
  const {getReadiness}=await import('./readiness.js');
  const readiness=await getReadiness(receivable.agency_id,receivable.client_id,db);
  if(readiness.collection_policy==='after_era'&&payload.verificationBasis!=='era')return 0;
  await requireResponsiblePayer(allocation.payer_user_id,receivable.client_id,receivable.agency_id,db);
  const [pending]=await db.execute("SELECT id FROM family_ledger_payments WHERE allocation_id=? AND status IN ('pending','requires_action','unknown') LIMIT 1",[allocation.id]);
  if(pending.length)return 0;
  const clinical=(await import('../../config/clinicalDatabase.js')).default;
  const sessionId=payload.attendanceSessionId||(receivable.source_type==='clinical_copay'?receivable.source_key:null);
  const [sessions]=sessionId?await clinical.execute('SELECT scheduled_start_at FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?',[sessionId,receivable.agency_id,receivable.client_id]):await clinical.execute('SELECT s.scheduled_start_at FROM clinical_claims c JOIN clinical_sessions s ON s.id=c.clinical_session_id AND s.agency_id=c.agency_id AND s.client_id=c.client_id WHERE c.id=? AND c.agency_id=? AND c.client_id=?',[receivable.source_key,receivable.agency_id,receivable.client_id]);
  if(!sessions[0]?.scheduled_start_at)return 0;
  const [credits]=await db.execute(`SELECT c.payment_id FROM family_copay_credits c JOIN family_ledger_payments p ON p.id=c.payment_id
    WHERE c.agency_id=? AND c.client_id=? AND c.payer_user_id=? AND c.service_at<? AND p.currency=? AND p.status='succeeded'
    ORDER BY c.service_at,c.payment_id FOR UPDATE`,[receivable.agency_id,receivable.client_id,allocation.payer_user_id,sessions[0].scheduled_start_at,receivable.currency]);
  let due=allocationDue(allocation),applied=0;
  for(const credit of credits){
    if(!due)break;
    const state=await paymentCreditState(credit.payment_id,db),amount=Math.min(due,state.availableCents);
    if(!amount)continue;
    const [inserted]=await db.execute('INSERT INTO family_copay_credit_applications (agency_id,payment_id,allocation_id,amount_cents) VALUES (?,?,?,?)',[receivable.agency_id,credit.payment_id,allocation.id,amount]);
    await db.execute('UPDATE family_receivable_allocations SET paid_cents=paid_cents+? WHERE id=?',[amount,allocation.id]);
    await queueReceiptEvent({agencyId:receivable.agency_id,paymentId:credit.payment_id,kind:'credit_applied',eventKey:`credit-application:${inserted.insertId}`},db);
    await auditBilling({agencyId:receivable.agency_id,clientId:receivable.client_id,userId:allocation.payer_user_id,action:'copay_credit_applied',objectId:inserted.insertId},db);
    due-=amount;applied+=amount;
  }
  allocation.paid_cents=Number(allocation.paid_cents)+applied;
  if(applied){
    const [[remaining]]=await db.execute('SELECT SUM(amount_cents-paid_cents) AS due FROM family_receivable_allocations WHERE receivable_id=?',[receivable.id]);
    if(Number(remaining.due)===0){
      await db.execute("UPDATE family_receivables SET status='paid' WHERE id=?",[receivable.id]);
      await db.execute('INSERT IGNORE INTO family_fulfillment_jobs (agency_id,receivable_id) VALUES (?,?)',[receivable.agency_id,receivable.id]);
    }
  }
  return applied;
}

async function reverseApplication(application,db,{hold=false,amount=Number(application.amount_cents)}={}) {
  const [[target]]=await db.execute('SELECT a.*,r.client_id,r.status AS receivable_status FROM family_receivable_allocations a JOIN family_receivables r ON r.id=a.receivable_id WHERE a.id=? FOR UPDATE',[application.allocation_id]);
  const [pending]=await db.execute("SELECT id FROM family_ledger_payments WHERE allocation_id=? AND status IN ('pending','requires_action','unknown') LIMIT 1",[application.allocation_id]);
  if(pending.length||amount<=0||amount>Number(application.amount_cents)||Number(target.paid_cents)<amount)throw billingError(409,'The applied credit needs payment reconciliation before a refund.');
  await db.execute('UPDATE family_receivable_allocations SET paid_cents=paid_cents-? WHERE id=?',[amount,application.allocation_id]);
  if(amount===Number(application.amount_cents))await db.execute("UPDATE family_copay_credit_applications SET status='reversed',reversed_at=CURRENT_TIMESTAMP WHERE id=? AND status='applied'",[application.id]);
  else{
    await db.execute('UPDATE family_copay_credit_applications SET amount_cents=amount_cents-? WHERE id=?',[amount,application.id]);
    await db.execute("INSERT INTO family_copay_credit_applications (agency_id,payment_id,allocation_id,amount_cents,status,reversed_at) VALUES (?,?,?,?,'reversed',CURRENT_TIMESTAMP)",[application.agency_id,application.payment_id,application.allocation_id,amount]);
  }
  if(hold&&target.receivable_status!=='void')await db.execute("UPDATE family_receivables SET status='review',hold_reason='credit_refund_review' WHERE id=?",[target.receivable_id]);
}

export async function prepareCreditRefund(payment,amount,db) {
  const state=await paymentCreditState(payment.id,db);
  if(!state?.isCredit)return;
  const [[used]]=await db.execute("SELECT COALESCE(SUM(amount_cents),0) AS amount FROM family_payment_refunds WHERE payment_id=? AND status IN ('pending','unknown','succeeded')",[payment.id]);
  let available=Number(payment.amount_cents)-Number(used.amount)-state.appliedCents;
  const [applications]=await db.execute("SELECT * FROM family_copay_credit_applications WHERE payment_id=? AND status='applied' ORDER BY id DESC FOR UPDATE",[payment.id]);
  for(const application of applications){
    if(available>=amount)break;
    const reversed=Math.min(Number(application.amount_cents),amount-available);
    await reverseApplication(application,db,{hold:true,amount:reversed});
    available+=reversed;
    await auditBilling({agencyId:payment.agency_id,userId:payment.payer_user_id,action:'copay_credit_reversed_for_refund',objectId:application.id},db);
  }
}

/** No charges or mail are created here. Repairs a cross-database interruption and
 * applies credit only to posted, verified subsequent visits. */
export async function reconcileCopayCredits({clinical=null}={}) {
  clinical||=(await import('../../config/clinicalDatabase.js')).default;
  const [held]=await pool.execute("SELECT r.* FROM family_receivables r WHERE r.hold_reason='attendance_not_occurred' AND r.source_type IN ('clinical_copay','claim_responsibility') ORDER BY r.id LIMIT 100");
  for(const row of held){
    const payload=sourcePayload(row),sessionId=payload.attendanceSessionId||(row.source_type==='clinical_copay'?Number(row.source_key):null);
    if(!sessionId)continue;
    const [[session]]=await clinical.execute("SELECT id FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=? AND encounter_status IN ('cancelled','canceled','no_show')",[sessionId,row.agency_id,row.client_id]);
    if(session)await creditCancelledSession({agencyId:row.agency_id,clientId:row.client_id,sessionId,actorUserId:null});
  }
  const [targets]=await pool.execute(`SELECT a.id,r.agency_id FROM family_receivable_allocations a JOIN family_receivables r ON r.id=a.receivable_id
    WHERE r.status='open' AND r.hold_reason IS NULL AND a.amount_cents>a.paid_cents AND EXISTS
    (SELECT 1 FROM family_copay_credits c WHERE c.agency_id=r.agency_id AND c.client_id=r.client_id AND c.payer_user_id=a.payer_user_id AND c.service_date<=r.service_date)
    ORDER BY r.service_date,r.id,a.id LIMIT 100`);
  for(const target of targets){
    try{await transaction(async db=>{
      const {lockAllocation}=await import('./payments.js');
      const {receivable,allocation}=await lockAllocation(target.agency_id,target.id,db);
      await applyCopayCreditsLocked(receivable,allocation,db);
    });}catch(error){if(error.status!==409&&error.status!==403)throw error;}
  }
}
