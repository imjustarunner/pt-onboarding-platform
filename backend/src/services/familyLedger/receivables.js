import { assertLedgerIntegrity } from './integrity.js';
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { readClientInsurance } from '../clientInsurance.service.js';
import { insuranceFingerprint } from './readiness.js';
import { billingError, auditBilling, requireResponsiblePayer, positiveId } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { cents, dateOnly, today, transaction, normalizeShares, allocateCents, assertSharesAuthorized, requireClient, parseJson, assertCollectible } from './policy.js';

export async function findReceivable(agencyId, id, db = pool, lock = false) {
  const [rows] = await db.execute(`SELECT * FROM family_receivables WHERE id = ? AND agency_id = ?${lock ? ' FOR UPDATE' : ''}`, [positiveId(id), positiveId(agencyId)]);
  if (!rows.length) throw billingError(404, 'Balance not found');
  return rows[0];
}
export async function allocationsFor(id, db = pool, lock = false) {
  const [rows] = await db.execute(`SELECT * FROM family_receivable_allocations WHERE receivable_id = ? ORDER BY id${lock ? ' FOR UPDATE' : ''}`, [id]);
  return rows;
}
export async function createReceivable(input, connection = null) {
  if (!connection) return transaction(db => createReceivable(input, db));
  const db = connection, agencyId = positiveId(input.agencyId), clientId = positiveId(input.clientId);
  const amount = cents(input.amountCents, { allowZero: true });
  const domain = String(input.serviceDomain || 'unknown');
  if (!['mental_health', 'clinical', 'tutoring', 'coaching', 'consulting', 'mentorship', 'unknown'].includes(domain)) throw billingError(400, 'Select a supported service category');
  const source = String(input.sourceType || ''), sourceKey = String(input.sourceKey || '');
  if (!/^[a-z_]{3,40}$/.test(source) || !/^[a-zA-Z0-9:_-]{1,100}$/.test(sourceKey)) throw billingError(400, 'A valid billing source is required');
  await requireClient(agencyId, clientId, db);
  // Lock the client to serialize source creation and alternating payer selection.
  await db.execute('SELECT id FROM clients WHERE id = ? AND agency_id = ? FOR UPDATE', [clientId, agencyId]);
  const [existing] = await db.execute('SELECT * FROM family_receivables WHERE agency_id = ? AND source_type = ? AND source_key = ?', [agencyId, source, sourceKey]);
  if (existing.length) {
    if (Number(existing[0].client_id) !== clientId || Number(existing[0].amount_cents) !== amount) throw billingError(409, 'The existing source balance differs; use an audited adjustment');
    return existing[0];
  }
  const confirmedZero = source === 'claim_responsibility' && input.insuranceReviewed === true && amount === 0;
  let shares = !confirmedZero && input.shares ? normalizeShares(input.shares) : null;
  if (!shares && !confirmedZero) {
    const [rules] = await db.execute('SELECT * FROM family_billing_rules WHERE agency_id = ? AND client_id = ? FOR UPDATE', [agencyId, clientId]);
    if (rules.length) {
      const rule = rules[0], all = normalizeShares(parseJson(rule.shares_json));
      shares = rule.rule_kind === 'alternate' ? [{ payerUserId: all[Number(rule.next_sequence) % all.length].payerUserId, basisPoints: 10000 }] : all;
      await db.execute('UPDATE family_billing_rules SET next_sequence = next_sequence + 1 WHERE agency_id = ? AND client_id = ?', [agencyId, clientId]);
    } else {
      const [payers] = await db.execute("SELECT guardian_user_id FROM client_billing_payers WHERE agency_id = ? AND client_id = ? AND status = 'active' ORDER BY guardian_user_id", [agencyId, clientId]);
      if (payers.length === 1) shares = [{ payerUserId: Number(payers[0].guardian_user_id), basisPoints: 10000 }];
    }
  }
  if (shares) await assertSharesAuthorized(agencyId, clientId, shares, db);
  const fingerprint = input.insuranceReviewed === true ? insuranceFingerprint(await readClientInsurance(clientId, agencyId, db)) : null;
  const proposed = { agency_id: agencyId, client_id: clientId, service_domain: domain, status: 'open', insurance_reviewed: input.insuranceReviewed === true, insurance_fingerprint: fingerprint, disputed_at: null, hold_reason: null };
  let status = input.reviewRequired || !shares ? 'review' : amount === 0 ? 'paid' : 'open';
  let hold = input.reviewRequired ? 'staff_review' : !shares ? 'payer_assignment' : null;
  if (confirmedZero) { status = 'paid'; hold = null; }
  else try { await assertCollectible(proposed, db); } catch (e) { if (e.status !== 409) throw e; status = 'review'; hold = 'insurance_review'; }
  const [result] = await db.execute(`INSERT INTO family_receivables (agency_id,client_id,source_type,source_key,service_domain,service_label,service_date,amount_cents,currency,due_date,status,insurance_reviewed,hold_reason,source_payload,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [agencyId, clientId, source, sourceKey, domain, String(input.serviceLabel || 'Services').slice(0,120), input.serviceDate ? dateOnly(input.serviceDate) : null, amount, 'USD', dateOnly(input.dueDate || today()), status, input.insuranceReviewed === true ? 1 : 0, hold, input.payload ? encryptFamilyBilling(input.payload, `receivable:${agencyId}:${clientId}`) : null, input.actorUserId || null]);
  const id = result.insertId;
  if (fingerprint) await db.execute('UPDATE family_receivables SET insurance_fingerprint=? WHERE id=?', [fingerprint, id]);
  const allocated = shares ? allocateCents(amount, shares) : [{ payerUserId: null, amountCents: amount }];
  for (const row of allocated) await db.execute('INSERT INTO family_receivable_allocations (agency_id,receivable_id,payer_user_id,amount_cents) VALUES (?,?,?,?)', [agencyId, id, row.payerUserId, row.amountCents]);
  await auditBilling({ agencyId, clientId, userId: input.actorUserId, action: 'receivable_created', objectId: id }, db);
  if (status === 'paid') await db.execute('INSERT IGNORE INTO family_fulfillment_jobs (agency_id,receivable_id) VALUES (?,?)', [agencyId,id]);
  return findReceivable(agencyId, id, db);
}
export function sourcePayload(row) { return row.source_payload ? decryptFamilyBilling(row.source_payload, `receivable:${row.agency_id}:${row.client_id}`) : {}; }
export async function setBillingRule({ agencyId, clientId, kind, shares, actorUserId, reason }) {
  if (!['single','split','alternate'].includes(kind) || !String(reason || '').trim()) throw billingError(400, 'Select a rule and document its authorization');
  const normalized = normalizeShares(shares);
  if (kind === 'single' && normalized.length !== 1) throw billingError(400, 'Select one payer');
  return transaction(async db => {
    await requireClient(agencyId, clientId, db); await assertSharesAuthorized(agencyId, clientId, normalized, db);
    await db.execute(`INSERT INTO family_billing_rules (agency_id,client_id,rule_kind,shares_json,evidence_encrypted,updated_by_user_id) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE rule_kind=VALUES(rule_kind),shares_json=VALUES(shares_json),evidence_encrypted=VALUES(evidence_encrypted),updated_by_user_id=VALUES(updated_by_user_id),next_sequence=0,version=version+1`, [agencyId,clientId,kind,JSON.stringify(normalized),encryptFamilyBilling({reason:String(reason).slice(0,2000),at:new Date().toISOString()},`billing-rule:${agencyId}:${clientId}`),actorUserId]);
    await auditBilling({agencyId,clientId,userId:actorUserId,action:'billing_rule_updated'},db);
  });
}
export async function allocateBalance({ agencyId, receivableId, shares, actorUserId, reason }, db) {
  const row = await findReceivable(agencyId, receivableId, db, true), existing = await allocationsFor(row.id, db, true);
  if (row.status === 'void') throw billingError(409,'Voided balances cannot be reassigned');
  const {externallyManaged}=await import('./collectionHandoff.js');
  for(const allocation of existing)if(await externallyManaged(allocation.id,db))throw billingError(409,'Reconcile the collection case before changing responsible payers');
  await assertSharesAuthorized(agencyId,row.client_id,shares,db);
  const [pending] = await db.execute("SELECT p.id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? AND p.status IN ('pending','requires_action','unknown') LIMIT 1",[row.id]);
  const [plans] = await db.execute("SELECT p.id FROM family_payment_plans p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? AND p.status IN ('proposed','active') LIMIT 1",[row.id]);
  if (pending.length || plans.length) throw billingError(409,'Resolve pending payments and cancel payment plans before changing shares');
  const paid = existing.reduce((n,a)=>n+Number(a.paid_cents),0), next = allocateCents(Number(row.amount_cents)-paid,shares);
  for (const a of existing) await db.execute('UPDATE family_receivable_allocations SET amount_cents=paid_cents WHERE id=?',[a.id]);
  for (const s of next) {
    const old=existing.find(a=>Number(a.payer_user_id)===s.payerUserId);
    if(old) await db.execute('UPDATE family_receivable_allocations SET amount_cents=paid_cents+? WHERE id=?',[s.amountCents,old.id]);
    else await db.execute('INSERT INTO family_receivable_allocations (agency_id,receivable_id,payer_user_id,amount_cents) VALUES (?,?,?,?)',[agencyId,row.id,s.payerUserId,s.amountCents]);
  }
  if(row.hold_reason==='payer_assignment') await db.execute("UPDATE family_receivables SET status=?,hold_reason=NULL WHERE id=?",[paid===Number(row.amount_cents)?'paid':'open',row.id]);
  if(reason)await db.execute('UPDATE family_receivables SET source_payload=? WHERE id=?',[encryptFamilyBilling({...sourcePayload(row),allocationReview:{reason:String(reason).slice(0,2000),shares,actorUserId,at:new Date().toISOString()}},`receivable:${agencyId}:${row.client_id}`),row.id]);
  await auditBilling({agencyId,clientId:row.client_id,userId:actorUserId,action:'payer_shares_updated',objectId:row.id},db);
}
export async function updateBalanceReview({ agencyId, receivableId, actorUserId, reason, disputed, release, insuranceReviewed, verificationBasis }) {
  if(!String(reason||'').trim()) throw billingError(400,'Document the reason for this change');
  if(verificationBasis!==undefined&&!['benefit','era'].includes(verificationBasis))throw billingError(400,'Select a valid responsibility verification basis');
  return transaction(async db=>{
    const row=await findReceivable(agencyId,receivableId,db,true);
    if(row.status==='void') throw billingError(409,'This balance is void');
    const updates={...row,insurance_reviewed:insuranceReviewed===true?1:row.insurance_reviewed,disputed_at:disputed===true?new Date():disputed===false?null:row.disputed_at};
    if (insuranceReviewed === true) updates.insurance_fingerprint = insuranceFingerprint(await readClientInsurance(row.client_id,agencyId,db));
    let claimReview={};
    if(insuranceReviewed===true&&row.source_type==='claim_responsibility'){
      const [changes]=await clinicalPool.execute('SELECT COALESCE(MAX(cr.id),0) AS latestId FROM clinical_claim_change_requests cr JOIN clinical_claims c ON c.clinical_session_id=cr.clinical_session_id AND c.agency_id=cr.agency_id WHERE c.id=? AND c.agency_id=?',[row.source_key,agencyId]);
      claimReview={verifiedClaimChangeId:Number(changes[0].latestId)};
      updates.source_payload=encryptFamilyBilling({...sourcePayload(row),...claimReview},`receivable:${agencyId}:${row.client_id}`);
      // A reviewer cannot pre-approve responsibility while a correction is pending.
      await assertCollectible({...updates,status:'open',hold_reason:null,disputed_at:null},db);
    }
    if(release) { updates.status='open'; updates.hold_reason=null; await assertCollectible(updates,db); const allocations=await allocationsFor(row.id,db); if(allocations.every(a=>Number(a.amount_cents)===Number(a.paid_cents)))updates.status='paid'; if(allocations.some(a=>!a.payer_user_id&&Number(a.amount_cents)>0))throw billingError(409,'Assign responsible payers first'); }
    if(verificationBasis&&!insuranceReviewed)throw billingError(400,'Verify patient responsibility before changing the remittance basis');
    await db.execute('UPDATE family_receivables SET status=?,insurance_reviewed=?,disputed_at=?,hold_reason=?,source_payload=? WHERE id=?',[release?updates.status:row.status,updates.insurance_reviewed,updates.disputed_at,release?null:row.hold_reason,encryptFamilyBilling({...sourcePayload(row),...claimReview,...(verificationBasis?{verificationBasis}:{}),reviewReason:String(reason).slice(0,2000),reviewedBy:actorUserId},`receivable:${agencyId}:${row.client_id}`),row.id]);
    await auditBilling({agencyId,clientId:row.client_id,userId:actorUserId,action:'balance_reviewed',objectId:row.id},db);
    if (insuranceReviewed === true) await db.execute('UPDATE family_receivables SET insurance_fingerprint=? WHERE id=?',[updates.insurance_fingerprint,row.id]);
  });
}

export async function adjustBalance({agencyId,receivableId,amountCents,reason,shares,actorUserId}) {
  if(!String(reason||'').trim())throw billingError(400,'Document the adjustment or cancellation reason');
  const amount=cents(amountCents,{allowZero:true});
  return transaction(async db=>{
    const row=await findReceivable(agencyId,receivableId,db,true),allocations=await allocationsFor(row.id,db,true);
    const paid=allocations.reduce((n,a)=>n+Number(a.paid_cents),0);if(amount<paid)throw billingError(409,'Refund received money before reducing the balance below net payments');
    if(row.status==='void')throw billingError(409,'A voided balance cannot be changed');
    if(amount>paid&&!shares?.length)throw billingError(400,'Specify the payer shares for the revised unpaid balance');
    const [pending]=await db.execute("SELECT p.id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? AND p.status IN ('pending','requires_action','unknown')",[row.id]);
    const [plans]=await db.execute("SELECT p.id FROM family_payment_plans p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? AND p.status IN ('proposed','active')",[row.id]);
    if(pending.length||plans.length)throw billingError(409,'Resolve pending payments and cancel plans before adjusting the balance');
    const payload=sourcePayload(row);
    if(amount>0){delete payload.zeroResponsibilityClosed;delete payload.finalPatientResponsibilityCents;delete payload.refundReviewCents;}
    payload.adjustments=[...(payload.adjustments||[]),{fromCents:Number(row.amount_cents),toCents:amount,reason:String(reason).slice(0,2000),actorUserId,at:new Date().toISOString()}];
    await db.execute('UPDATE family_receivables SET amount_cents=?,source_payload=? WHERE id=?',[amount,encryptFamilyBilling(payload,`receivable:${agencyId}:${row.client_id}`),row.id]);
    if(amount===paid){for(const a of allocations)await db.execute('UPDATE family_receivable_allocations SET amount_cents=paid_cents WHERE id=?',[a.id]);await db.execute("UPDATE family_receivables SET status=?,hold_reason=NULL,disputed_at=NULL WHERE id=?",[amount===0?'void':'paid',row.id]);}
    else {await allocateBalance({agencyId,receivableId:row.id,shares,actorUserId},db);await db.execute("UPDATE family_receivables SET status='review',hold_reason='adjustment_review' WHERE id=?",[row.id]);}
    await auditBilling({agencyId,clientId:row.client_id,userId:actorUserId,action:'balance_adjusted',objectId:row.id},db);
    return findReceivable(agencyId,row.id,db);
  });
}

// A final zero is a liability adjustment, never a fabricated payment or refund.
// Keep already-received money in its original allocations until it is refunded.
export async function closeZeroClaimResponsibility(row, payload, actorUserId, db) {
  const allocations = await allocationsFor(row.id, db, true);
  const {externallyManaged}=await import('./collectionHandoff.js');
  for(const allocation of allocations)if(await externallyManaged(allocation.id,db))throw billingError(409,'Reconcile the collection case before closing patient responsibility');
  await assertLedgerIntegrity(row, db);
  const [pending] = await db.execute("SELECT p.id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? AND p.status IN ('pending','requires_action','unknown')", [row.id]);
  if (pending.length) throw billingError(409, 'Reconcile the pending payment before closing patient responsibility');
  const paid = allocations.reduce((n, a) => n + Number(a.paid_cents), 0);
  for (const a of allocations) await db.execute('UPDATE family_receivable_allocations SET amount_cents=paid_cents WHERE id=?', [a.id]);
  await db.execute("UPDATE family_payment_plans p JOIN family_receivable_allocations a ON a.id=p.allocation_id SET p.status='cancelled',p.auto_pay=0 WHERE a.receivable_id=? AND p.status IN ('proposed','active')", [row.id]);
  const updated = { ...payload, finalPatientResponsibilityCents: 0, zeroResponsibilityClosed: true, refundReviewCents: paid };
  if (!payload.zeroResponsibilityClosed) updated.adjustments = [...(payload.adjustments || []), { fromCents: Number(row.amount_cents), toCents: 0, reason: payload.verificationReason, actorUserId, at: new Date().toISOString() }];
  await db.execute("UPDATE family_receivables SET amount_cents=?,status='paid',hold_reason=NULL,disputed_at=NULL,source_payload=? WHERE id=? AND agency_id=?", [paid, encryptFamilyBilling(updated, `receivable:${row.agency_id}:${row.client_id}`), row.id, row.agency_id]);
  await auditBilling({ agencyId: row.agency_id, clientId: row.client_id, userId: actorUserId, action: paid ? 'zero_responsibility_refund_review' : 'zero_responsibility_closed', objectId: row.id }, db);
}

// Apply the final liability to the existing visit, retaining every payment.
// A lower adjudicated amount becomes a refund-review credit, never a second charge.
export async function applyFinalClaimResponsibility(row, amount, payload, actorUserId, db) {
  const allocations=await allocationsFor(row.id,db,true);
  await assertLedgerIntegrity(row,db);
  const {externallyManaged}=await import('./collectionHandoff.js');
  for(const allocation of allocations)if(await externallyManaged(allocation.id,db))throw billingError(409,'Reconcile the collection case before changing patient responsibility');
  const [pending]=await db.execute("SELECT p.id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? AND p.status IN ('pending','requires_action','unknown')",[row.id]);
  if(pending.length)throw billingError(409,'Reconcile the pending payment before changing patient responsibility');
  const original=allocations.reduce((n,a)=>n+Number(a.amount_cents),0);
  if(!allocations.length||(!original&&allocations.length>1))throw billingError(409,'Review responsible payer shares before changing this balance');
  let assigned=0,refundReviewCents=0,effective=0,paid=0;
  for(let index=0;index<allocations.length;index++){
    const a=allocations[index],target=index===allocations.length-1?amount-assigned:Math.floor(amount*Number(a.amount_cents)/original);
    assigned+=target;const received=Number(a.paid_cents),next=Math.max(received,target);
    effective+=next;paid+=received;refundReviewCents+=Math.max(0,received-target);
    await db.execute('UPDATE family_receivable_allocations SET amount_cents=? WHERE id=?',[next,a.id]);
  }
  await db.execute("UPDATE family_payment_plans p JOIN family_receivable_allocations a ON a.id=p.allocation_id SET p.status='cancelled',p.auto_pay=0 WHERE a.receivable_id=? AND p.status IN ('proposed','active')",[row.id]);
  const revised={...payload,finalPatientResponsibilityCents:amount,refundReviewCents,adjustments:[...(payload.adjustments||[]),{fromCents:Number(row.amount_cents),toCents:amount,reason:payload.verificationReason,actorUserId,at:new Date().toISOString()}]};
  // Outstanding revised balances require the existing billing review/release action.
  // Settled balances close immediately; no prior copay is collected twice.
  await db.execute('UPDATE family_receivables SET amount_cents=?,status=?,hold_reason=?,source_payload=? WHERE id=? AND agency_id=?',[effective,effective===paid?'paid':'review',effective===paid?null:'era_balance_review',encryptFamilyBilling(revised,`receivable:${row.agency_id}:${row.client_id}`),row.id,row.agency_id]);
  await auditBilling({agencyId:row.agency_id,clientId:row.client_id,userId:actorUserId,action:'era_liability_adjusted',objectId:row.id},db);
  await assertLedgerIntegrity(await findReceivable(row.agency_id,row.id,db),db);
}
