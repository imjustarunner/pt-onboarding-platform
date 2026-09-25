import crypto from 'node:crypto';
import pool from '../config/database.js';
import {billingError,auditBilling} from './familyBillingPolicy.service.js';

export function validateServiceFees(input) {
  if(typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.revision)||input.revision<0)throw billingError(400,'Refresh the service agreement before saving');
  for(const [key,max] of [['claimUnitCents',100000],['eligibilityUnitCents',100000],['cardFeeBps',10000],['cardFixedCents',100000]])if(!Number.isSafeInteger(input[key])||input[key]<0||input[key]>max)throw billingError(400,'Service rates must be valid nonnegative cents or basis points');
  if(typeof input.contractReference!=='string'||input.contractReference.trim().length<5||input.contractReference.length>1000)throw billingError(400,'Record the agency service agreement reference');
  if(input.enabled&&input.termsConfirmed!==true)throw billingError(400,'Confirm the agency accepted these service fees');
}
export function calculateCardFee(amount,agreement) {
  if(!Number.isSafeInteger(amount)||amount<1)throw billingError(400,'Invalid payment amount');
  if(!agreement?.enabled)return 0;
  // Fees are deducted from agency proceeds and can never exceed the payment.
  return Math.min(Math.max(0,amount-1),Math.round(amount*Number(agreement.card_fee_bps)/10000)+Number(agreement.card_fixed_cents));
}
export async function saveServiceFeeAgreement(input) {
  validateServiceFees(input);const db=await pool.getConnection();
  try {
    await db.beginTransaction();await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[input.agencyId]);
    const [[latest]]=await db.execute('SELECT revision FROM medical_service_fee_agreements WHERE agency_id=? ORDER BY revision DESC LIMIT 1 FOR UPDATE',[input.agencyId]);
    if(Number(latest?.revision||0)!==input.revision)throw billingError(409,'The agreement changed; refresh before saving');
    const [r]=await db.execute('INSERT INTO medical_service_fee_agreements (agency_id,revision,enabled,claim_unit_cents,eligibility_unit_cents,card_fee_bps,card_fixed_cents,contract_reference,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)',[input.agencyId,input.revision+1,input.enabled,input.claimUnitCents,input.eligibilityUnitCents,input.cardFeeBps,input.cardFixedCents,input.contractReference.trim(),input.actorUserId]);
    await auditBilling({agencyId:input.agencyId,userId:input.actorUserId,action:'medical_service_fee_agreement_recorded',objectId:r.insertId},db);
    await db.commit();return {id:r.insertId,revision:input.revision+1};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function serviceFeeAgreementOverview(agencyId) {
  const [history]=await pool.execute('SELECT * FROM medical_service_fee_agreements WHERE agency_id=? ORDER BY revision DESC LIMIT 50',[agencyId]);
  return {agreement:history[0]||null,history,activationEnabled:process.env.MEDICAL_SERVICE_FEES_ENABLED==='true'};
}
/** Pin zero as well as nonzero fees so a retry cannot acquire a new price.
 * Missing migrations are tolerated only while deployment activation is off.
 */
export async function quoteAgencyCardFee({agencyId,connectedAccountId,amountCents,currency,idempotencyKey},deps={}) {
  const enabled=(deps.env||process.env).MEDICAL_SERVICE_FEES_ENABLED==='true';
  if(!Number.isSafeInteger(Number(agencyId))||Number(agencyId)<1||!connectedAccountId)return {feeCents:0};
  if(!idempotencyKey){if(enabled)throw billingError(409,'A stable payment reference is required before applying agency fees');return {feeCents:0};}
  const requestHash=crypto.createHash('sha256').update(String(idempotencyKey)).digest('hex');
  const db=await (deps.db||pool).getConnection();
  try {
    await db.beginTransaction();
    const [[merchant]]=await db.execute('SELECT stripe_connect_account_id FROM agency_billing_accounts WHERE agency_id=? FOR UPDATE',[agencyId]);
    if(merchant?.stripe_connect_account_id!==connectedAccountId)throw billingError(409,'The payment account does not belong to this agency');
    const [[old]]=await db.execute('SELECT * FROM medical_service_card_quotes WHERE agency_id=? AND request_hash=?',[agencyId,requestHash]);
    if(old){if(Date.now()-new Date(old.created_at).getTime()>23*3600000)throw billingError(409,'This payment reference needs processor reconciliation before another creation attempt');if(Number(old.amount_cents)!==amountCents||old.currency!==currency||old.connected_account_id!==connectedAccountId)throw billingError(409,'Payment reference belongs to different payment terms');await db.commit();return {feeCents:Number(old.fee_cents),quoteId:old.id};}
    const [[agreement]]=await db.execute('SELECT * FROM medical_service_fee_agreements WHERE agency_id=? AND effective_at<=CURRENT_TIMESTAMP(6) ORDER BY effective_at DESC,id DESC LIMIT 1',[agencyId]);
    const fee=calculateCardFee(amountCents,enabled?agreement:null);
    const [r]=await db.execute('INSERT INTO medical_service_card_quotes (agency_id,request_hash,connected_account_id,amount_cents,currency,agreement_id,fee_cents) VALUES (?,?,?,?,?,?,?)',[agencyId,requestHash,connectedAccountId,amountCents,currency,agreement?.id||null,fee]);
    await db.commit();return {feeCents:fee,quoteId:r.insertId};
  }catch(e){await db.rollback();if(!enabled&&e.code==='ER_NO_SUCH_TABLE')return {feeCents:0};throw e;}finally{db.release();}
}

export function previousUsagePeriod(invoiceStart) {
  const start=new Date(invoiceStart);if(!Number.isFinite(start.getTime()))throw billingError(400,'Invalid invoice period');
  const end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1));
  return {start:new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-1,1)),end};
}
export async function reserveMedicalServiceUsage({agencyId,kind,sourceId},deps={}) {
  if((deps.env||process.env).MEDICAL_SERVICE_FEES_ENABLED!=='true')return null;
  if(!['claim','eligibility'].includes(kind)||!Number.isSafeInteger(Number(sourceId))||Number(sourceId)<1)throw billingError(400,'Invalid metered service source');
  const db=deps.db||pool;
  const [[agreement]]=await db.execute('SELECT * FROM medical_service_fee_agreements WHERE agency_id=? AND effective_at<=CURRENT_TIMESTAMP(6) ORDER BY effective_at DESC,id DESC LIMIT 1',[agencyId]);
  const price=agreement?.enabled?Number(kind==='claim'?agreement.claim_unit_cents:agreement.eligibility_unit_cents):0;
  await db.execute('INSERT INTO medical_service_usage (agency_id,kind,source_id,agreement_id,unit_cents) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE source_id=VALUES(source_id)',[agencyId,kind,sourceId,agreement?.id||null,price]);
  const [[row]]=await db.execute('SELECT id FROM medical_service_usage WHERE agency_id=? AND kind=? AND source_id=?',[agencyId,kind,sourceId]);
  return row.id;
}
export async function completeMedicalServiceUsage(id,agencyId,db=pool) {
  if(!id)return;
  await db.execute("UPDATE medical_service_usage SET status='completed',completed_at=CURRENT_TIMESTAMP(6) WHERE id=? AND agency_id=? AND status='pending'",[id,agencyId]);
}
export function groupMedicalUsage(rows,fallbackMonth) {
  const grouped=new Map();
  for(const row of rows){
    if(!Number(row.unit_cents))continue;
    const month=row.completed_at?new Date(row.completed_at).toISOString().slice(0,7):fallbackMonth;
    const key=`medical_${month}_${row.kind}_${row.agreement_id}_${row.unit_cents}`;
    const line=grouped.get(key)||{key,kind:row.kind,quantity:0,unitCostCents:Number(row.unit_cents),agreementId:row.agreement_id,usageMonth:month,usageIds:[]};
    line.quantity++;line.usageIds.push(row.id);grouped.set(key,line);
  }
  return [...grouped.values()].map(l=>({...l,amountCents:l.quantity*l.unitCostCents,label:`${l.kind==='claim'?'Acknowledged claim transmissions':'Returned eligibility checks'} (${l.usageMonth}): ${l.quantity} × $${(l.unitCostCents/100).toFixed(2)}`}));
}
export async function medicalServiceInvoiceLines(agencyId,invoiceStart,deps={}) {
  if((deps.env||process.env).MEDICAL_SERVICE_FEES_ENABLED!=='true')return [];
  const {start,end}=previousUsagePeriod(invoiceStart),db=deps.db||pool;
  const [rows]=await db.execute("SELECT id,kind,agreement_id,unit_cents,completed_at FROM medical_service_usage WHERE agency_id=? AND status='completed' AND invoice_id IS NULL AND unit_cents>0 AND completed_at<? ORDER BY id FOR UPDATE",[agencyId,end]);
  return groupMedicalUsage(rows,start.toISOString().slice(0,7));
}
export async function attachMedicalServiceInvoice(agencyId,invoiceId,lines,db) {
  for(const line of lines)for(const id of line.usageIds){
    const [r]=await db.execute('UPDATE medical_service_usage SET invoice_id=? WHERE id=? AND agency_id=? AND invoice_id IS NULL AND status=\'completed\'',[invoiceId,id,agencyId]);
    if(r.affectedRows!==1)throw billingError(409,'A service charge was already invoiced; refresh the invoice');
  }
}
export function appendMedicalServiceLines(estimate,lines) {
  if(!lines.length||estimate.businessAgreement?.ended)return estimate;
  const amount=lines.reduce((n,l)=>n+l.amountCents,0);
  return {...estimate,medicalServiceLines:lines,
    ...(estimate.chargeLines?{chargeLines:[...estimate.chargeLines,...lines]}:{lineItems:[...(estimate.lineItems||[]),...lines.map(l=>({...l,used:l.quantity,extraCents:l.amountCents}))]}),
    totals:{...estimate.totals,medicalServicesCents:amount,totalCents:estimate.totals.totalCents+amount}};
}
