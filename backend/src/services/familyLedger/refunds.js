import pool from '../../config/database.js';
import Stripe from '../stripePayments.service.js';
import { billingError, auditBilling } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { cents, key, transaction } from './policy.js';
import { lockAllocation } from './payments.js';

export async function refundPayment({agencyId,paymentId,amountCents,idempotencyKey,actorUserId,reason}) {
  const amount=cents(amountCents), requestKey=key(idempotencyKey);
  if(!String(reason||'').trim())throw billingError(400,'A refund reason is required');
  const prepared=await transaction(async db=>{
    const [lookup]=await db.execute('SELECT * FROM family_ledger_payments WHERE id=? AND agency_id=?',[paymentId,agencyId]);
    if(!lookup.length||lookup[0].status!=='succeeded')throw billingError(409,'Only a recorded successful payment can be refunded');
    if(!['CASH','STRIPE'].includes(lookup[0].processor))throw billingError(409,'Reconcile imported payments through the original payment system');
    const payment=lookup[0],{receivable}=await lockAllocation(agencyId,payment.allocation_id,db);
    const [existing]=await db.execute('SELECT * FROM family_payment_refunds WHERE agency_id=? AND idempotency_key=? FOR UPDATE',[agencyId,requestKey]);
    if(existing.length) {
      if(Number(existing[0].payment_id)!==Number(paymentId)||Number(existing[0].amount_cents)!==amount)throw billingError(409,'This refund reference belongs to another payment');
      return {refund:existing[0],payment};
    }
    const [used]=await db.execute("SELECT COALESCE(SUM(amount_cents),0) AS amount FROM family_payment_refunds WHERE payment_id=? AND status IN ('pending','succeeded','unknown')",[paymentId]);
    if(amount>Number(payment.amount_cents)-Number(used[0].amount))throw billingError(409,'Refund exceeds the remaining refundable payment');
    // Preserve the receivable. A refund reopens its payer share; cancelling a
    // service is a separate audited operation and must not invent a credit.
    const [result]=await db.execute('INSERT INTO family_payment_refunds (agency_id,payment_id,amount_cents,idempotency_key,reason_encrypted,created_by_user_id) VALUES (?,?,?,?,?,?)',[agencyId,paymentId,amount,requestKey,encryptFamilyBilling({reason:String(reason).slice(0,2000)},`refund:${agencyId}:${paymentId}`),actorUserId]);
    await auditBilling({agencyId,clientId:receivable.client_id,userId:actorUserId,action:'refund_requested',objectId:result.insertId},db);
    return {refund:{id:result.insertId,agency_id:agencyId,payment_id:paymentId,amount_cents:amount,status:'pending'},payment};
  });
  if(prepared.refund.status==='succeeded')return {refunded:true,refundId:prepared.refund.id,alreadyRefunded:true};
  if(prepared.payment.processor==='CASH') { await finalizeRefund(prepared.refund.id,agencyId,null,null); return {refunded:true,refundId:prepared.refund.id}; }
  if(prepared.payment.processor!=='STRIPE')throw billingError(409,'Reconcile imported payments through the original payment system');
  const snapshot=decryptFamilyBilling(prepared.payment.snapshot_encrypted,`ledger-payment:${agencyId}:${prepared.payment.allocation_id}`);
  let result;
  try { result=prepared.refund.processor_refund_id?await Stripe.retrieveRefund(prepared.refund.processor_refund_id,snapshot.accountId):await Stripe.refundPaymentIntent({paymentIntentId:prepared.payment.processor_intent_id,amountCents:prepared.refund.amount_cents,connectedAccountId:snapshot.accountId,idempotencyKey:`family-refund:${agencyId}:${prepared.refund.id}`,metadata:{family_ledger_refund_id:String(prepared.refund.id),agency_id:String(agencyId)}}); }
  catch {await pool.execute("UPDATE family_payment_refunds SET status='unknown' WHERE id=? AND status<>'succeeded'",[prepared.refund.id]);throw billingError(409,'Refund confirmation is pending; retry this same refund reference');}
  await pool.execute('UPDATE family_payment_refunds SET processor_refund_id=? WHERE id=?',[result.id,prepared.refund.id]);
  if(result.status==='succeeded') {await finalizeRefund(prepared.refund.id,agencyId,result,snapshot.accountId);return {refunded:true,refundId:prepared.refund.id};}
  if(['failed','canceled'].includes(result.status))await pool.execute("UPDATE family_payment_refunds SET status='failed' WHERE id=?",[prepared.refund.id]);
  return {refunded:false,pending:!['failed','canceled'].includes(result.status),refundId:prepared.refund.id};
}
export async function finalizeRefund(refundId,agencyId,processorRefund,accountId) {
  return transaction(async db=>{
    const [refunds]=await db.execute('SELECT r.*,p.allocation_id,p.payer_user_id,p.processor,p.processor_intent_id,p.snapshot_encrypted FROM family_payment_refunds r JOIN family_ledger_payments p ON p.id=r.payment_id WHERE r.id=? AND r.agency_id=?',[refundId,agencyId]);
    if(!refunds.length)throw billingError(404,'Refund not found');
    const row=refunds[0],{receivable,allocation}=await lockAllocation(agencyId,row.allocation_id,db);
    const [current]=await db.execute('SELECT status FROM family_payment_refunds WHERE id=? FOR UPDATE',[refundId]);
    if(row.processor==='STRIPE') {
      const snapshot=decryptFamilyBilling(row.snapshot_encrypted,`ledger-payment:${agencyId}:${row.allocation_id}`);
      if(snapshot.accountId!==accountId||processorRefund?.status!=='succeeded'||Number(processorRefund.amount)!==Number(row.amount_cents)||processorRefund.payment_intent!==row.processor_intent_id||String(processorRefund.metadata?.family_ledger_refund_id)!==String(refundId))throw billingError(409,'Refund confirmation does not match the payment');
    } else if(row.processor!=='CASH'||processorRefund)throw billingError(409,'Unsupported refund processor');
    if(current[0].status==='succeeded')return;
    if(Number(row.amount_cents)>Number(allocation.paid_cents))throw billingError(409,'Refund requires reconciliation');
    await db.execute('UPDATE family_receivable_allocations SET paid_cents=paid_cents-? WHERE id=?',[row.amount_cents,allocation.id]);
    await db.execute("UPDATE family_payment_refunds SET status='succeeded',completed_at=CURRENT_TIMESTAMP WHERE id=?",[refundId]);
    await db.execute("UPDATE family_receivables SET status='review',hold_reason='refund_review' WHERE id=?",[receivable.id]);
    await auditBilling({agencyId,clientId:receivable.client_id,userId:row.created_by_user_id,action:'payment_refunded',objectId:refundId},db);
  });
}
export async function reconcileLedgerRefund(refund,accountId) {
  if(!refund.metadata?.family_ledger_refund_id)return false;
  if(refund.status==='succeeded')await finalizeRefund(Number(refund.metadata.family_ledger_refund_id),Number(refund.metadata.agency_id),refund,accountId);
  return true;
}
