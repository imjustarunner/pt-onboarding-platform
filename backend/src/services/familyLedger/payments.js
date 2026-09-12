import crypto from 'node:crypto';
import pool from '../../config/database.js';
import Cards from '../../models/GuardianPaymentCard.model.js';
import Stripe, { getStripePublishableKey } from '../stripePayments.service.js';
import { billingError, requireResponsiblePayer, auditBilling } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { verifyPaymentResult } from '../familyBillingPayment.service.js';
import { cents, key, transaction, assertCollectible, allocationDue, dateOnly, today } from './policy.js';
import { findReceivable, allocationsFor } from './receivables.js';

const context = (agencyId, allocationId) => `ledger-payment:${agencyId}:${allocationId}`;
export async function lockAllocation(agencyId, allocationId, db) {
  const [lookup] = await db.execute('SELECT receivable_id FROM family_receivable_allocations WHERE id=? AND agency_id=?',[allocationId,agencyId]);
  if(!lookup.length)throw billingError(404,'Payer balance not found');
  const receivable=await findReceivable(agencyId,lookup[0].receivable_id,db,true);
  const allocations=await allocationsFor(receivable.id,db,true);
  return {receivable,allocation:allocations.find(a=>Number(a.id)===Number(allocationId))};
}
export async function activeCard(agencyId, clientId, userId, db) {
  const payer=await requireResponsiblePayer(userId,clientId,agencyId,db);
  const cards=await Cards.findActiveByGuardian(userId,agencyId,db);
  const card=cards.find(c=>Number(c.id)===Number(payer.payment_card_id));
  if(!card?.stripe_payment_method_id||!card?.connected_account_id)throw billingError(409,'Assign your verified card to this client first');
  const [merchant]=await db.execute("SELECT stripe_connect_account_id FROM agency_billing_accounts WHERE agency_id=? AND stripe_connect_status='active'",[agencyId]);
  if(merchant[0]?.stripe_connect_account_id!==card.connected_account_id)throw billingError(409,'Verify a card for this organization’s payment account');
  return {payer,card};
}
async function assertRecurring({agencyId,userId,clientId,payer,card,amount},db) {
  const [consents]=await db.execute("SELECT id FROM guardian_billing_consents WHERE id=? AND agency_id=? AND guardian_user_id=? AND client_id=? AND payment_card_id=? AND purpose='recurring' AND revoked_at IS NULL",[payer.consent_id||0,agencyId,userId,clientId,card.id]);
  if(!consents.length||amount>Number(payer.recurring_limit_cents||0))throw billingError(409,'This amount is not covered by a current recurring authorization');
}
export async function payAllocation({agencyId,userId,allocationId,amountCents,idempotencyKey,automatic=false,planId=null}) {
  const amount=cents(amountCents), requestKey=key(idempotencyKey);
  const attempt=await transaction(async db=>{
    const {receivable,allocation}=await lockAllocation(agencyId,allocationId,db);
    await requireResponsiblePayer(userId,receivable.client_id,agencyId,db);
    if(Number(allocation.payer_user_id)!==Number(userId))throw billingError(403,'You can pay only your assigned share');
    const [same]=await db.execute('SELECT * FROM family_ledger_payments WHERE agency_id=? AND idempotency_key=?',[agencyId,requestKey]);
    if(same.length) {
      if(Number(same[0].allocation_id)!==Number(allocationId)||Number(same[0].payer_user_id)!==Number(userId)||Number(same[0].amount_cents)!==amount)throw billingError(409,'This request key belongs to a different payment');
      if(same[0].status==='succeeded')return same[0];
    }
    await assertCollectible(receivable,db);
    if(amount>allocationDue(allocation))throw billingError(409,'The amount exceeds your current unpaid share; refresh the balance');
    const {payer,card}=await activeCard(agencyId,receivable.client_id,userId,db);
    if(automatic && planId) {
      const [plans]=await db.execute("SELECT * FROM family_payment_plans WHERE id=? AND agency_id=? AND allocation_id=? AND payer_user_id=? AND status='active' AND auto_pay=1 FOR UPDATE",[planId,agencyId,allocationId,userId]);
      if(!plans.length)throw billingError(409,'Automatic payment plan authorization is no longer active');
      const plan=plans[0], evidence=decryptFamilyBilling(plan.consent_encrypted,`payment-plan:${agencyId}:${userId}`);
      if(!evidence.autoPay||Number(evidence.paymentCardId)!==Number(card.id))throw billingError(409,'The payment plan needs authorization for this card');
      const [installments]=await db.execute('SELECT * FROM family_plan_installments WHERE plan_id=? ORDER BY sequence_number',[planId]);
      let paid=Math.max(0,Number(allocation.paid_cents)-Number(plan.paid_before_cents)),due=0;
      for(const installment of installments){const applied=Math.min(paid,Number(installment.amount_cents));paid-=applied;if(!due&&dateOnly(installment.due_date)<=today())due=Number(installment.amount_cents)-applied;}
      if(!due||amount!==due)throw billingError(409,'The installment balance changed; refresh the schedule');
    } else if(automatic)await assertRecurring({agencyId,userId,clientId:receivable.client_id,payer,card,amount},db);
    const [inflight]=await db.execute("SELECT * FROM family_ledger_payments WHERE allocation_id=? AND status IN ('pending','requires_action','unknown') ORDER BY id DESC LIMIT 1 FOR UPDATE",[allocationId]);
    let previous=inflight[0]||same[0];
    if(previous) {
      if(Number(previous.amount_cents)!==amount)throw billingError(409,'Resolve the pending payment before changing the amount');
      const snapshot=decryptFamilyBilling(previous.snapshot_encrypted,context(agencyId,allocationId));
      if(snapshot.paymentMethodId!==card.stripe_payment_method_id) {
        if(!previous.processor_intent_id)throw billingError(409,'The previous payment must be reconciled before changing cards');
        const intent=await Stripe.retrievePaymentIntent(previous.processor_intent_id,snapshot.accountId);
        if(!['requires_payment_method','canceled'].includes(intent.status))throw billingError(409,'The previous payment is still processing or requires authentication');
        const cancelled=intent.status==='canceled'?intent:await Stripe.cancelPaymentIntent(intent.id,snapshot.accountId);
        if(cancelled.status!=='canceled')throw billingError(409,'Previous payment cancellation has not been confirmed');
        await db.execute("UPDATE family_ledger_payments SET status='cancelled' WHERE id=?",[previous.id]);
        if(previous.idempotency_key===requestKey)throw billingError(409,'The previous attempt is cancelled. Start a new payment request.');
        previous=null;
      } else {
        if(!previous.processor_intent_id&&Date.now()-new Date(previous.created_at).getTime()>23*3600000)throw billingError(409,'This payment needs processor reconciliation before retrying');
        if(['cancelled','failed'].includes(previous.status))throw billingError(409,'Start a new payment request after correcting the payment method');
        return previous;
      }
    }
    const snapshot={customerId:card.stripe_customer_id,paymentMethodId:card.stripe_payment_method_id,accountId:card.connected_account_id,amountCents:amount,currency:String(receivable.currency).toLowerCase(),brand:card.card_brand,last4:card.card_last4};
    const [result]=await db.execute("INSERT INTO family_ledger_payments (agency_id,allocation_id,payer_user_id,processor,amount_cents,currency,idempotency_key,snapshot_encrypted,created_by_user_id) VALUES (?,?,?,'STRIPE',?,?,?,?,?)",[agencyId,allocationId,userId,amount,receivable.currency,requestKey,encryptFamilyBilling(snapshot,context(agencyId,allocationId)),userId]);
    return {id:result.insertId,agency_id:agencyId,allocation_id:allocationId,payer_user_id:userId,amount_cents:amount,status:'pending',idempotency_key:requestKey,snapshot_encrypted:encryptFamilyBilling(snapshot,context(agencyId,allocationId))};
  });
  if(attempt.status==='succeeded')return {paid:true,alreadyPaid:true,paymentId:attempt.id};
  const snapshot=decryptFamilyBilling(attempt.snapshot_encrypted,context(agencyId,allocationId));
  let intent;
  try {
    intent=attempt.processor_intent_id?await Stripe.retrievePaymentIntent(attempt.processor_intent_id,snapshot.accountId):await Stripe.chargePaymentMethod({customerId:snapshot.customerId,paymentMethodId:snapshot.paymentMethodId,connectedAccountId:snapshot.accountId,amountCents:snapshot.amountCents,currency:snapshot.currency,metadata:{agency_id:String(agencyId),family_ledger_payment_id:String(attempt.id)},idempotencyKey:`family-ledger:${agencyId}:${attempt.id}`});
  } catch(e) {
    const pending=e.payment_intent||e.raw?.payment_intent;
    if(pending?.id)intent=await Stripe.retrievePaymentIntent(pending.id,snapshot.accountId);
    else { await pool.execute("UPDATE family_ledger_payments SET status='unknown' WHERE id=? AND status<>'succeeded'",[attempt.id]); throw billingError(409,'Payment confirmation is pending. Refresh this payment before making another attempt.'); }
  }
  if(Number(intent.amount)!==snapshot.amountCents||intent.currency!==snapshot.currency||(typeof intent.customer==='string'?intent.customer:intent.customer?.id)!==snapshot.customerId)throw billingError(409,'Processor payment does not match the saved attempt');
  await pool.execute('UPDATE family_ledger_payments SET processor_intent_id=? WHERE id=? AND agency_id=?',[intent.id,attempt.id,agencyId]);
  if(intent.status==='succeeded') { await finalizePayment(attempt.id,agencyId,intent,snapshot.accountId); return {paid:true,paymentId:attempt.id}; }
  const authentication=intent.status==='requires_action'||(intent.status==='requires_payment_method'&&(intent.last_payment_error?.code==='authentication_required'||intent.last_payment_error?.decline_code==='authentication_required'));
  await pool.execute("UPDATE family_ledger_payments SET status=? WHERE id=? AND status<>'succeeded'",[authentication?'requires_action':intent.status==='canceled'?'cancelled':'pending',attempt.id]);
  if(authentication&&!automatic)return {paid:false,requiresAction:true,clientSecret:intent.client_secret,paymentMethodId:snapshot.paymentMethodId,connectedAccountId:snapshot.accountId,publishableKey:getStripePublishableKey(),paymentId:attempt.id};
  throw billingError(409,authentication?'Sign in to complete bank authentication':intent.status==='requires_payment_method'?'The card was declined. Verify another card and retry.':'Payment is processing; refresh before retrying');
}
async function receiptSnapshot(payment,receivable,snapshot,db,receivedAt) {
  const [agencies]=await db.execute('SELECT name FROM agencies WHERE id=?',[payment.agency_id]);
  const [payers]=await db.execute('SELECT first_name,last_name FROM users WHERE id=?',[payment.payer_user_id]);
  return {receiptNumber:`R-${payment.agency_id}-${payment.id}`,agencyName:agencies[0]?.name||'Organization',payerName:[payers[0]?.first_name,payers[0]?.last_name].filter(Boolean).join(' '),service:['mental_health','clinical','unknown'].includes(receivable.service_domain)?'Services':`${receivable.service_domain} services`,amountCents:Number(payment.amount_cents),currency:payment.currency,receivedAt:new Date(receivedAt).toISOString(),method:payment.processor==='CASH'?'Cash':payment.processor==='LEGACY'?'Previously recorded payment':`${snapshot.brand||'Card'} ending in ${snapshot.last4||'••••'}`};
}
async function postCapture(payment,receivable,allocation,snapshot,db,receivedAt=new Date()) {
  if(payment.status==='succeeded')return;
  if(Number(payment.amount_cents)>allocationDue(allocation))throw billingError(409,'Payment exceeds the remaining share; reconciliation is required');
  const receipt=await receiptSnapshot(payment,receivable,snapshot,db,receivedAt);
  await db.execute('UPDATE family_receivable_allocations SET paid_cents=paid_cents+? WHERE id=?',[payment.amount_cents,allocation.id]);
  await db.execute("UPDATE family_ledger_payments SET status='succeeded',received_at=?,receipt_number=?,receipt_encrypted=? WHERE id=?",[new Date(receivedAt),receipt.receiptNumber,encryptFamilyBilling(receipt,`receipt:${payment.agency_id}:${payment.payer_user_id}`),payment.id]);
  const [remaining]=await db.execute('SELECT SUM(amount_cents-paid_cents) AS remaining FROM family_receivable_allocations WHERE receivable_id=?',[receivable.id]);
  if(Number(remaining[0].remaining)===0) {
    await db.execute("UPDATE family_receivables SET status='paid' WHERE id=?",[receivable.id]);
    await db.execute('INSERT INTO family_fulfillment_jobs (agency_id,receivable_id) VALUES (?,?) ON DUPLICATE KEY UPDATE status=IF(status=\'completed\',status,\'pending\')',[payment.agency_id,receivable.id]);
  }
  await auditBilling({agencyId:payment.agency_id,clientId:receivable.client_id,userId:payment.created_by_user_id,action:'ledger_payment_received',objectId:payment.id},db);
}
export async function finalizePayment(paymentId,agencyId,intent,accountId) {
  return transaction(async db=>{
    const [lookup]=await db.execute('SELECT * FROM family_ledger_payments WHERE id=? AND agency_id=?',[paymentId,agencyId]);
    if(!lookup.length)throw billingError(404,'Payment not found');
    const {receivable,allocation}=await lockAllocation(agencyId,lookup[0].allocation_id,db);
    const [rows]=await db.execute('SELECT * FROM family_ledger_payments WHERE id=? FOR UPDATE',[paymentId]);
    const payment=rows[0], snapshot=decryptFamilyBilling(payment.snapshot_encrypted,context(agencyId,payment.allocation_id));
    if(payment.processor!=='STRIPE'||snapshot.accountId!==accountId||(payment.processor_intent_id&&payment.processor_intent_id!==intent.id)||String(intent.metadata?.family_ledger_payment_id)!==String(payment.id)||String(intent.metadata?.agency_id)!==String(agencyId))throw billingError(409,'Payment binding mismatch');
    verifyPaymentResult(intent,snapshot);
    await db.execute('UPDATE family_ledger_payments SET processor_intent_id=? WHERE id=?',[intent.id,payment.id]);
    await postCapture(payment,receivable,allocation,snapshot,db);
    return {paid:true,paymentId};
  });
}
export async function reconcileLedgerPayment(intent,accountId) {
  if(!intent.metadata?.family_ledger_payment_id)return false;
  await finalizePayment(Number(intent.metadata.family_ledger_payment_id),Number(intent.metadata.agency_id),intent,accountId); return true;
}
export async function recordCash({agencyId,allocationId,payerUserId,amountCents,receivedAt,idempotencyKey,actorUserId,note}) {
  const amount=cents(amountCents), requestKey=key(idempotencyKey), received=new Date(receivedAt||Date.now());
  if(!Number.isFinite(received.getTime())||received.getTime()>Date.now()+60000||!String(note||'').trim())throw billingError(400,'Enter the received date and cash receipt/reference note');
  return transaction(async db=>{
    const {receivable,allocation}=await lockAllocation(agencyId,allocationId,db);
    if(Number(allocation.payer_user_id)!==Number(payerUserId))throw billingError(409,'Record the payment against the selected responsible payer’s share');
    await requireResponsiblePayer(payerUserId,receivable.client_id,agencyId,db);
    const [existing]=await db.execute('SELECT * FROM family_ledger_payments WHERE agency_id=? AND idempotency_key=?',[agencyId,requestKey]);
    if(existing.length) {
      if(existing[0].processor!=='CASH'||Number(existing[0].allocation_id)!==Number(allocationId)||Number(existing[0].amount_cents)!==amount)throw billingError(409,'Receipt reference belongs to another payment');
      return {paymentId:existing[0].id,alreadyRecorded:true};
    }
    await assertCollectible(receivable,db);
    const [pending]=await db.execute("SELECT id FROM family_ledger_payments WHERE allocation_id=? AND status IN ('pending','requires_action','unknown') LIMIT 1",[allocationId]);
    if(pending.length)throw billingError(409,'Resolve the pending card payment before recording cash');
    if(amount>allocationDue(allocation))throw billingError(409,'Cash exceeds the unpaid share');
    const snapshot={note:String(note).slice(0,2000)};
    const [result]=await db.execute("INSERT INTO family_ledger_payments (agency_id,allocation_id,payer_user_id,processor,amount_cents,currency,idempotency_key,snapshot_encrypted,created_by_user_id) VALUES (?,?,?,'CASH',?,?,?,?,?)",[agencyId,allocationId,payerUserId,amount,receivable.currency,requestKey,encryptFamilyBilling(snapshot,context(agencyId,allocationId)),actorUserId]);
    const payment={id:result.insertId,agency_id:agencyId,allocation_id:allocationId,payer_user_id:payerUserId,processor:'CASH',amount_cents:amount,currency:receivable.currency,created_by_user_id:actorUserId,status:'pending'};
    await postCapture(payment,receivable,allocation,snapshot,db,received);
    return {paymentId:payment.id,recorded:true};
  });
}

/** Internal adapter: called only after the original checkout has verified Stripe. */
export async function recordVerifiedPackageSettlement({agencyId,clientId,payerUserId,packageId,entitlementId,amountCents,paymentIntentId,actorUserId}) {
  return transaction(async db=>{
    const {createReceivable}=await import('./receivables.js');
    const r=await createReceivable({agencyId,clientId,sourceType:'package_settlement',sourceKey:paymentIntentId,serviceDomain:'unknown',amountCents,shares:[{payerUserId,basisPoints:10000}],actorUserId,payload:{packageId,entitlementId,paymentIntentId,verifiedExistingCheckout:true}},db);
    const [allocation]=await allocationsFor(r.id,db,true);
    const requestKey=`verified-package:${paymentIntentId}`;
    const [existing]=await db.execute('SELECT id FROM family_ledger_payments WHERE agency_id=? AND idempotency_key=?',[agencyId,requestKey]);if(existing.length)return {paymentId:existing[0].id};
    // Already-received funds must be recorded even when coverage changed after capture.
    const snapshot={originalPaymentIntentId:paymentIntentId};
    const [result]=await db.execute("INSERT INTO family_ledger_payments (agency_id,allocation_id,payer_user_id,processor,amount_cents,currency,idempotency_key,snapshot_encrypted,created_by_user_id,processor_intent_id) VALUES (?,?,?,'LEGACY',?,'USD',?,?,?,?)",[agencyId,allocation.id,payerUserId,amountCents,requestKey,encryptFamilyBilling(snapshot,context(agencyId,allocation.id)),actorUserId||payerUserId,paymentIntentId]);
    await postCapture({id:result.insertId,agency_id:agencyId,payer_user_id:payerUserId,processor:'LEGACY',amount_cents:amountCents,currency:'USD',created_by_user_id:actorUserId||payerUserId,status:'pending'},r,allocation,snapshot,db);
    return {paymentId:result.insertId};
  });
}
