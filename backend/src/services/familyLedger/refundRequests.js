import pool from '../../config/database.js';
import { billingError, auditBilling } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { transaction, cents } from './policy.js';
import { lockAllocation } from './payments.js';
import { receiptFor } from './views.js';
import { paymentCreditState } from './copayCredits.js';

export async function receiptWorkspace({agencyId,paymentId,userId,staff=false}) {
  const receipt=await receiptFor({agencyId,paymentId,userId,staff});
  const [[payment]]=await pool.execute('SELECT payer_user_id,processor,allocation_id FROM family_ledger_payments WHERE id=? AND agency_id=?',[paymentId,agencyId]);
  const own=Number(payment.payer_user_id)===Number(userId);
  const [refundRequests]=own||staff?await pool.execute('SELECT * FROM family_payment_refund_requests WHERE agency_id=? AND payment_id=? ORDER BY id DESC',[agencyId,paymentId]):[[]];
  const [applications]=await pool.execute(`SELECT c.id,c.amount_cents AS amountCents,c.status,r.service_date AS serviceDate,r.id AS balanceReference
    FROM family_copay_credit_applications c JOIN family_receivable_allocations a ON a.id=c.allocation_id JOIN family_receivables r ON r.id=a.receivable_id
    WHERE c.payment_id=? AND c.agency_id=? ORDER BY c.id`,[paymentId,agencyId]);
  const [deliveries]=own||staff?await pool.execute('SELECT kind,status,sent_at AS sentAt FROM family_receipt_deliveries WHERE agency_id=? AND payment_id=? ORDER BY id',[agencyId,paymentId]):[[]];
  return {receipt,credit:await paymentCreditState(paymentId),applications,deliveries,
    canRequestRefund:own&&['STRIPE','CASH'].includes(payment.processor)&&receipt.netPaidCents>0,
    refundRequests:refundRequests.map(r=>({id:r.id,amountCents:r.amount_cents,status:r.status,createdAt:r.created_at,
      reason:decryptFamilyBilling(r.reason_encrypted,`refund-request:${agencyId}:${paymentId}`).reason,
      resolution:r.resolution_encrypted?decryptFamilyBilling(r.resolution_encrypted,`refund-request:${agencyId}:${paymentId}`).reason:null}))};
}

export async function requestPaymentRefund({agencyId,paymentId,userId,amountCents,reason}) {
  const amount=cents(amountCents),note=String(reason||'').trim();
  if(!note||note.length>2000)throw billingError(400,'Explain the refund request in 2,000 characters or fewer.');
  return transaction(async db=>{
    const [[payment]]=await db.execute("SELECT * FROM family_ledger_payments WHERE id=? AND agency_id=? AND status='succeeded'",[paymentId,agencyId]);
    if(!payment||Number(payment.payer_user_id)!==Number(userId))throw billingError(404,'Payment not found for your account.');
    if(!['STRIPE','CASH'].includes(payment.processor))throw billingError(409,'Contact billing about a payment imported from another system.');
    const {receivable}=await lockAllocation(agencyId,payment.allocation_id,db);
    const [[existing]]=await db.execute("SELECT id,status FROM family_payment_refund_requests WHERE payment_id=? AND status IN ('requested','processing','review') ORDER BY id DESC FOR UPDATE",[paymentId]);
    if(existing)return {requestId:existing.id,status:existing.status,alreadyRequested:true};
    const [[refunds]]=await db.execute("SELECT COALESCE(SUM(amount_cents),0) AS amount FROM family_payment_refunds WHERE payment_id=? AND status IN ('pending','unknown','succeeded')",[paymentId]);
    if(amount>Number(payment.amount_cents)-Number(refunds.amount))throw billingError(409,'The request exceeds the remaining unrefunded payment.');
    const [inserted]=await db.execute('INSERT INTO family_payment_refund_requests (agency_id,payment_id,payer_user_id,amount_cents,reason_encrypted) VALUES (?,?,?,?,?)',[agencyId,paymentId,userId,amount,encryptFamilyBilling({reason:note},`refund-request:${agencyId}:${paymentId}`)]);
    await auditBilling({agencyId,clientId:receivable.client_id,userId,action:'payer_refund_requested',objectId:inserted.insertId},db);
    return {requestId:inserted.insertId,status:'requested'};
  });
}

export async function listRefundRequests({agencyId}) {
  const [rows]=await pool.execute(`SELECT q.*,p.receipt_number AS receiptNumber,r.client_id AS clientId,r.source_type AS sourceType,r.source_key AS sourceKey,r.service_date AS serviceDate
    FROM family_payment_refund_requests q JOIN family_ledger_payments p ON p.id=q.payment_id
    JOIN family_receivable_allocations a ON a.id=p.allocation_id JOIN family_receivables r ON r.id=a.receivable_id
    WHERE q.agency_id=? AND q.status IN ('requested','processing','review') ORDER BY q.id LIMIT 100`,[agencyId]);
  return rows.map(row=>({requestId:row.id,paymentId:row.payment_id,receiptNumber:row.receiptNumber,clientId:row.clientId,serviceDate:row.serviceDate,
    amountCents:row.amount_cents,status:row.status,reason:decryptFamilyBilling(row.reason_encrypted,`refund-request:${agencyId}:${row.payment_id}`).reason}));
}

export async function resolveRefundRequest({agencyId,requestId,actorUserId,approve,reason}) {
  if(typeof approve!=='boolean'||!String(reason||'').trim())throw billingError(400,'Record the billing review and decision.');
  const [[request]]=await pool.execute('SELECT * FROM family_payment_refund_requests WHERE id=? AND agency_id=?',[requestId,agencyId]);
  if(!request)throw billingError(404,'Refund request not found.');
  if(approve){
    if(request.status==='declined')throw billingError(409,'This request was declined.');
    const {refundPayment}=await import('./refunds.js');
    return refundPayment({agencyId,paymentId:request.payment_id,amountCents:Number(request.amount_cents),idempotencyKey:`payer-request:${requestId}`,refundRequestId:requestId,actorUserId,reason});
  }
  return transaction(async db=>{
    const [[payment]]=await db.execute('SELECT allocation_id FROM family_ledger_payments WHERE id=? AND agency_id=?',[request.payment_id,agencyId]);
    const {receivable}=await lockAllocation(agencyId,payment.allocation_id,db);
    const [[current]]=await db.execute('SELECT status FROM family_payment_refund_requests WHERE id=? FOR UPDATE',[requestId]);
    if(current.status!=='requested')throw billingError(409,'This request is already being processed or was resolved.');
    await db.execute("UPDATE family_payment_refund_requests SET status='declined',reviewed_by_user_id=?,resolution_encrypted=?,resolved_at=CURRENT_TIMESTAMP WHERE id=?",[actorUserId,encryptFamilyBilling({reason:String(reason).trim().slice(0,2000)},`refund-request:${agencyId}:${request.payment_id}`),requestId]);
    await auditBilling({agencyId,clientId:receivable.client_id,userId:actorUserId,action:'payer_refund_request_declined',objectId:requestId},db);
    return {declined:true};
  });
}
