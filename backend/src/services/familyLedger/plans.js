import pool from '../../config/database.js';
import { billingError, auditBilling, requireResponsiblePayer } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { cents, dateOnly, today, transaction, allocationDue, assertCollectible } from './policy.js';
import { lockAllocation, payAllocation, activeCard } from './payments.js';

export const PLAN_TERMS_VERSION='family-payment-plan-2026-09-v1';
export function validateInstallments(installments,total) {
  if(!Array.isArray(installments)||installments.length<2||installments.length>60)throw billingError(400,'Use between 2 and 60 installments');
  const rows=installments.map(i=>({amountCents:cents(i.amountCents),dueDate:dateOnly(i.dueDate)}));
  if(rows.reduce((n,i)=>n+i.amountCents,0)!==total||rows.some((r,i)=>i>0&&r.dueDate<=rows[i-1].dueDate))throw billingError(400,'Installments must total the unpaid share with increasing due dates');
  return rows;
}
export function installmentBalances(installments,paid){let remaining=Math.max(0,Number(paid));return installments.map(i=>{const used=Math.min(Number(i.amount_cents),remaining);remaining-=used;return {...i,balance_cents:Number(i.amount_cents)-used};});}
export async function proposePlan({agencyId,allocationId,installments,actorUserId}) {
  return transaction(async db=>{
    const {receivable,allocation}=await lockAllocation(agencyId,allocationId,db);await assertCollectible(receivable,db);
    if(!allocation.payer_user_id)throw billingError(409,'Assign a responsible payer first');
    const rows=validateInstallments(installments,allocationDue(allocation));
    if(rows[0].dueDate<today())throw billingError(400,'The first installment cannot be in the past');
    const [active]=await db.execute("SELECT id FROM family_payment_plans WHERE allocation_id=? AND status IN ('proposed','active')",[allocationId]);
    const [pending]=await db.execute("SELECT id FROM family_ledger_payments WHERE allocation_id=? AND status IN ('pending','requires_action','unknown')",[allocationId]);
    if(active.length||pending.length)throw billingError(409,'Resolve existing plans or pending payments first');
    const [result]=await db.execute('INSERT INTO family_payment_plans (agency_id,allocation_id,payer_user_id,amount_cents,paid_before_cents,created_by_user_id) VALUES (?,?,?,?,?,?)',[agencyId,allocationId,allocation.payer_user_id,allocationDue(allocation),allocation.paid_cents,actorUserId]);
    for(let i=0;i<rows.length;i++)await db.execute('INSERT INTO family_plan_installments (plan_id,sequence_number,amount_cents,due_date) VALUES (?,?,?,?)',[result.insertId,i+1,rows[i].amountCents,rows[i].dueDate]);
    await auditBilling({agencyId,clientId:receivable.client_id,userId:actorUserId,action:'payment_plan_proposed',objectId:result.insertId},db);return {planId:result.insertId};
  });
}
export async function acceptPlan({agencyId,planId,userId,autoPay,consent,ip,userAgent}) {
  if(consent?.accepted!==true||consent?.version!==PLAN_TERMS_VERSION||!String(consent?.signatureName||'').trim())throw billingError(400,'Read and sign the payment plan terms');
  return transaction(async db=>{
    const [lookup]=await db.execute('SELECT * FROM family_payment_plans WHERE id=? AND agency_id=?',[planId,agencyId]);
    if(!lookup.length||Number(lookup[0].payer_user_id)!==Number(userId))throw billingError(403,'Payment plan belongs to another payer');
    const {receivable,allocation}=await lockAllocation(agencyId,lookup[0].allocation_id,db);
    const payer=await requireResponsiblePayer(userId,receivable.client_id,agencyId,db);await assertCollectible(receivable,db);
    const [rows]=await db.execute('SELECT * FROM family_payment_plans WHERE id=? FOR UPDATE',[planId]);const plan=rows[0];
    if(plan.status!=='proposed'||Number(plan.paid_before_cents)!==Number(allocation.paid_cents))throw billingError(409,'The balance or plan changed; request an updated plan');
    if(autoPay)await activeCard(agencyId,receivable.client_id,userId,db);
    if(autoPay&&!payer.payment_card_id)throw billingError(409,'Assign your verified card before enabling automatic installments');
    const [installments]=await db.execute('SELECT amount_cents,due_date FROM family_plan_installments WHERE plan_id=? ORDER BY sequence_number',[planId]);
    const evidence={ip:String(ip||'').slice(0,80),userAgent:String(userAgent||'').slice(0,500),version:PLAN_TERMS_VERSION,signatureName:String(consent.signatureName).trim().slice(0,255),acceptedAt:new Date().toISOString(),autoPay:!!autoPay,paymentCardId:autoPay?payer.payment_card_id:null,installments,terms:'I agree to the listed amounts and due dates for my share. If I enable automatic payment, I authorize those installments on my selected card. I can revoke automatic payment; unpaid amounts remain due. This does not authorize another person’s card or additional services.'};
    await db.execute("UPDATE family_payment_plans SET status='active',auto_pay=?,consent_encrypted=?,accepted_at=CURRENT_TIMESTAMP WHERE id=?",[autoPay?1:0,encryptFamilyBilling(evidence,`payment-plan:${agencyId}:${userId}`),planId]);
    await auditBilling({agencyId,clientId:receivable.client_id,userId,action:'payment_plan_accepted',objectId:planId},db);
  });
}
export async function cancelPlan({agencyId,planId,userId,staff=false}) {
  return transaction(async db=>{
    const [rows]=await db.execute('SELECT * FROM family_payment_plans WHERE id=? AND agency_id=?',[planId,agencyId]);
    if(!rows.length)throw billingError(404,'Plan not found');const plan=rows[0];
    const {receivable}=await lockAllocation(agencyId,plan.allocation_id,db);
    if(!staff){await requireResponsiblePayer(userId,receivable.client_id,agencyId,db);if(Number(plan.payer_user_id)!==Number(userId))throw billingError(403,'Plan belongs to another payer');}
    await db.execute("UPDATE family_payment_plans SET status='cancelled',auto_pay=0 WHERE id=? AND status IN ('proposed','active')",[planId]);
    await auditBilling({agencyId,clientId:receivable.client_id,userId,action:'payment_plan_cancelled',objectId:planId},db);
  });
}
export async function runDuePlans({agencyId,limit=50}) {
  const [plans]=await pool.query("SELECT p.*,a.paid_cents FROM family_payment_plans p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE p.agency_id=? AND p.status='active' AND p.auto_pay=1 ORDER BY p.id LIMIT ?",[agencyId,Math.min(100,Number(limit)||50)]);
  const results=[];
  for(const plan of plans){
    const [installments]=await pool.execute('SELECT * FROM family_plan_installments WHERE plan_id=? ORDER BY sequence_number',[plan.id]);
    const balances=installmentBalances(installments,Number(plan.paid_cents)-Number(plan.paid_before_cents));
    if(balances.every(i=>i.balance_cents===0)){await pool.execute("UPDATE family_payment_plans SET status='completed',auto_pay=0 WHERE id=?",[plan.id]);continue;}
    const due=balances.find(i=>i.balance_cents>0&&dateOnly(i.due_date)<=today());if(!due)continue;
    try{const result=await payAllocation({agencyId,userId:plan.payer_user_id,allocationId:plan.allocation_id,amountCents:due.balance_cents,idempotencyKey:`installment:${due.id}:paid:${plan.paid_cents}`,automatic:true,planId:plan.id});results.push({planId:plan.id,...result});}
    catch(e){results.push({planId:plan.id,paid:false,message:e.status?e.message:'Payment needs review'});}
  }
  return results;
}
