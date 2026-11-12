import crypto from 'node:crypto';
import pool from '../config/database.js';
import { decryptBillingSecret } from './billingEncryption.service.js';
import { computeLineAmount } from './paySystem.service.js';
import { payrollDefaultsForCode } from './payrollServiceCodeDefaults.js';

const day = v => v instanceof Date ? v.toISOString().slice(0,10) : String(v || '').slice(0,10);
const money = v => Math.round(Number(v || 0) * 100) / 100;
const parse = v => typeof v === 'string' ? JSON.parse(v) : v || {};
const text = v => String(v || '').trim().toLowerCase().replace(/\s+/g,' ');
const first = v => { const s=text(v); return (s.includes(',') ? s.split(',')[1].trim() : s).split(/\s+/)[0]; };
const code = v => String(v || '').trim().toUpperCase();
const payable = r => code(r.note_status)==='FINALIZED' || (code(r.note_status)==='DRAFT' && Number(r.draft_payable)===1);
const locked = p => ['posted','finalized'].includes(text(p?.status)) || p?.posted_at || p?.finalized_at || p?.posted_by_user_id || p?.finalized_by_user_id;
const fail = (message,status=409) => {throw Object.assign(new Error(message),{status});};
function decode(r) {
  const out={...r};
  for(const key of ['provider_name','patient_first_name']) if(!out[key] && out[key+'_ciphertext_b64']) out[key]=decryptBillingSecret({ciphertextB64:out[key+'_ciphertext_b64'],ivB64:out[key+'_iv_b64'],authTagB64:out[key+'_auth_tag_b64']});
  return out;
}
const identity = r => [Number(r.user_id),day(r.service_date),first(r.patient_first_name)].join('|');
const same = (a,b) => identity(a)===identity(b) && code(a.service_code)===code(b.service_code);

export function originalServicePay({ breakdown, row }) {
  const candidates=Object.entries(breakdown).filter(([key,line]) => !key.startsWith('__') && line && typeof line==='object' && code(line.displayServiceCode || key)===code(row.service_code));
  // A mixed-rate historical line cannot safely be assigned to one session.
  if(candidates.length!==1) return null;
  const line=candidates[0][1], totalUnits=Number(line.finalizedUnits ?? line.units);
  if(!(totalUnits>0) || Number(row.unit_count)>totalUnits+.00001 || !Number.isFinite(Number(line.amount))) return null;
  if(line.payMethod && line.payMethod!=='fixed_rate') return null;
  const ratio=Number(row.unit_count)/totalUnits;
  const base=money(Number(line.amount)*ratio);
  const indirect=money(Math.max(0,Number(line.hcodeGrossAmount ?? line.amount)-Number(line.amount))*ratio);
  return {baseAmount:base,autoIndirectAmount:indirect,total:money(base+indirect),
    credits:Number(line.hourEquivalent ?? line.creditsHours ?? line.hours ?? 0)*ratio,
    rate:Number(line.rateAmount),rateUnit:line.rateUnit || 'per_unit',category:line.bucket || line.category || 'direct',line};
}

export async function buildPayrollCorrectionReview({destinationPeriodId,agencyId,sourcePayrollPeriodId,baselineRowId,compareRowId=null,db=pool,lockRows=false}) {
  const [[destination]]=await db.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=?'+(lockRows?' FOR UPDATE':''),[Number(destinationPeriodId),Number(agencyId)]);
  if(!destination) fail('Destination payroll not found.',404);
  const [[source]]=await db.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=?',[Number(sourcePayrollPeriodId),Number(agencyId)]);
  if(!source || day(source.period_end)>=day(destination.period_start)) fail('Choose an earlier source payroll in this agency.',400);
  const [found]=await db.execute(`SELECT r.*,i.slot_number FROM payroll_import_rows r JOIN payroll_imports i ON i.id=r.payroll_import_id AND i.agency_id=r.agency_id WHERE r.agency_id=? AND r.payroll_period_id=? AND r.id IN (?,?)`+(lockRows?' FOR UPDATE':''),[Number(agencyId),Number(sourcePayrollPeriodId),Number(baselineRowId),Number(compareRowId || 0)]);
  const beforeRaw=found.find(r=>Number(r.id)===Number(baselineRowId));const afterRaw=compareRowId?found.find(r=>Number(r.id)===Number(compareRowId)):null;
  if(!beforeRaw || (compareRowId&&!afterRaw)) fail('The source session was not found in this agency and payroll.',404);
  const before=decode(beforeRaw),after=afterRaw?decode(afterRaw):null;
  if(!before.user_id || !first(before.patient_first_name)) fail('The original session identity needs a manual review.');
  if(after && (identity(before)!==identity(after) || Number(after.slot_number)<=Number(before.slot_number))) fail('The original and replacement rows do not identify the same session in successive reports.',400);
  if(after && code(before.service_code)===code(after.service_code) && Number(before.unit_count)===Number(after.unit_count)) fail('There is no service-code or quantity change to review.',400);
  const [[latestImport]]=await db.execute('SELECT id,slot_number FROM payroll_imports WHERE agency_id=? AND payroll_period_id=? ORDER BY COALESCE(slot_number,1) DESC,id DESC LIMIT 1',[Number(agencyId),Number(sourcePayrollPeriodId)]);
  if(after && Number(after.payroll_import_id)!==Number(latestImport?.id)) fail('A newer source report is available. Refresh the comparison.');
  if(!after) {
    if(!latestImport || Number(latestImport.slot_number)<=Number(before.slot_number)) fail('A later report is required to confirm removal.');
    const [latestRows]=await db.execute('SELECT * FROM payroll_import_rows WHERE agency_id=? AND payroll_import_id=? AND user_id=?',[Number(agencyId),Number(latestImport.id),Number(before.user_id)]);
    const currentRows=latestRows.map(decode);
    if(currentRows.some(r=>same(r,before))) fail('This session is still in the latest report. Refresh the comparison before treating it as removed.');
    const [previousRaw]=await db.execute('SELECT * FROM payroll_import_rows WHERE agency_id=? AND payroll_import_id=? AND user_id=?',[Number(agencyId),Number(before.payroll_import_id),Number(before.user_id)]);
    const previousRows=previousRaw.map(decode);
    const replacement=currentRows.some(r=>identity(r)===identity(before)&&payable(r)
      && !previousRows.some(p=>same(p,r)&&payable(p)&&Number(p.unit_count)===Number(r.unit_count)));
    if(replacement) fail('A possible replacement service exists for this session. Review the code change before posting a full reversal.');
  }
  const blockers=[];
  if(locked(destination)) blockers.push('This destination payroll is posted or finalized. Choose an open payroll.');
  if(!payable(before)) blockers.push('The baseline row was not payable. Review the original payment first.');
  if(after&&(!payable(after) || !(Number(after.unit_count)>0))) blockers.push('The replacement note is incomplete or marked unpaid. Review its eligibility first.');
  const [primaryRaw]=await db.execute(`SELECT r.* FROM payroll_import_rows r WHERE r.agency_id=? AND r.payroll_period_id=? AND r.user_id=? AND r.payroll_import_id=(SELECT i.id FROM payroll_imports i WHERE i.agency_id=? AND i.payroll_period_id=? AND COALESCE(i.slot_number,1)=1 ORDER BY i.id DESC LIMIT 1)`,[Number(agencyId),Number(sourcePayrollPeriodId),Number(before.user_id),Number(agencyId),Number(sourcePayrollPeriodId)]);
  const originals=primaryRaw.map(decode).filter(r=>same(r,before)&&payable(r));
  const payments=[];
  if(locked(source)&&originals.length===1) payments.push({period:source,paidRow:originals[0],proof:'Original payroll import'});
  const [carryovers]=await db.execute(`SELECT c.*,p.period_start,p.period_end,p.status,p.posted_at,p.finalized_at FROM payroll_stage_carryovers c JOIN payroll_periods p ON p.id=c.payroll_period_id AND p.agency_id=c.agency_id WHERE c.agency_id=? AND c.user_id=? AND p.status IN ('posted','finalized') AND p.period_end<?`,[Number(agencyId),Number(before.user_id),day(destination.period_start)]);
  for(const c of carryovers) for(const raw of parse(c.carryover_meta_json).rawAuditRows || []) {
    const matched={user_id:c.user_id,service_date:raw.serviceDate,patient_first_name:raw.patientFirstName,service_code:raw.toServiceCode || c.service_code};
    if(same(matched,before)) payments.push({period:{...c,id:c.payroll_period_id},paidRow:before,proof:'Posted catch-up entry'});
  }
  if(payments.length!==1) blockers.push(payments.length?'More than one original payment matches. Reconcile duplicate payments before posting a reduction.':'No posted payment could be confirmed for this session. A payable draft label alone does not prove payment.');
  const payment=payments.length===1?payments[0]:null;
  let original=null,corrected=null,summary=null;
  if(payment) {
    const [[saved]]=await db.execute('SELECT * FROM payroll_summaries WHERE payroll_period_id=? AND agency_id=? AND user_id=?'+(lockRows?' FOR UPDATE':''),[Number(payment.period.id),Number(agencyId),Number(before.user_id)]);
    summary=saved;const breakdown=parse(saved?.breakdown);
    const salaryOverride=breakdown.__adjustments?.basePayIsSalaryOverride === true
      || (Number(breakdown.__adjustments?.salaryAmount || 0)>0 && !breakdown.__adjustments?.salaryIncludeServicePay);
    if(salaryOverride) blockers.push('The original payroll used salary instead of separate service pay. Reconcile the salary and service-pay allocation in Payroll Stage.');
    original=salaryOverride?null:originalServicePay({breakdown,row:payment.paidRow});
    if(!original) blockers.push('The historical session amount cannot be isolated from the saved payroll. Review it in Payroll Stage.');
    if(Number(breakdown.__paySystem?.paySystemBonusTotal || breakdown.__paySystem?.bonuses?.totalBonusAmount || 0)>0) blockers.push('The original payroll includes bonus pay. Review its bonus impact in Payroll Stage before posting an automatic adjustment.');
    if(original) {
      const oldLine=original.line;
      if(!after) corrected={baseAmount:0,autoIndirectAmount:0,total:0,credits:0,rate:null,rateUnit:null,category:original.category};
      else if(oldLine.agreementRateProfile && oldLine.rateEraStatus) {
        const [rules]=await db.execute('SELECT * FROM payroll_service_code_rules WHERE agency_id=? AND UPPER(service_code)=?',[Number(agencyId),code(after.service_code)]);
        const newSaved=Object.entries(breakdown).find(([key,v])=>!key.startsWith('__')&&v&&typeof v==='object'&&code(v.displayServiceCode || key)===code(after.service_code))?.[1];
        const rule=newSaved?{...(rules[0] || {}),pay_divisor:newSaved.payDivisor,credit_value:newSaved.creditValue,category:newSaved.category,pay_rate_unit:newSaved.rateUnit}:rules[0] || payrollDefaultsForCode(code(after.service_code));
        if(!rule) fail('The replacement service has no configured payroll rule. Review its pay setup before posting a correction.');
        const quoted=computeLineAmount({rateProfile:oldLine.agreementRateProfile,status:{...oldLine.rateEraStatus,asOfDate:day(after.service_date)},serviceCode:code(after.service_code),quantity:Number(after.unit_count),rule});
        corrected={baseAmount:money(quoted.amount),autoIndirectAmount:money(quoted.autoIndirectAmount),total:money(Number(quoted.amount)+Number(quoted.autoIndirectAmount)),credits:Number(quoted.hourEquivalent || 0),rate:quoted.rate,rateUnit:quoted.rateLabel,category:quoted.payType};
      } else blockers.push('A dated compensation snapshot is unavailable for the replacement code. Review the corrected amount in Payroll Stage.');
    }
  }
  const bucket = value => ['indirect','support_activity','admin','meeting'].includes(text(value)) ? 'indirect' : 'direct';
  if(after&&original&&corrected&&bucket(original.category)!==bucket(corrected.category)) blockers.push('This correction changes pay buckets. Review the reclassification in Payroll Stage.');
  const originalPay=original?.total ?? null,correctedPay=corrected?.total ?? null;
  const reduction=originalPay!=null&&correctedPay!=null?money(Math.max(0,originalPay-correctedPay)):null;
  const adjustmentAmount=originalPay!=null&&correctedPay!=null?money(correctedPay-originalPay):null;
  const adjustmentType=adjustmentAmount<0?'reduction':adjustmentAmount>0?'additional_pay':'none';
  if(adjustmentAmount===0) blockers.push('The service pay is unchanged. No pay adjustment is needed.');
  const key=crypto.createHash('sha256').update(['payroll-correction-v1',agencyId,before.user_id,identity(before),code(before.service_code),payment?.period.id || 'unconfirmed'].join('|')).digest('hex');
  const [[existing]]=await db.execute(`SELECT m.id,m.payroll_period_id,m.amount,p.period_end FROM payroll_manual_pay_lines m JOIN payroll_periods p ON p.id=m.payroll_period_id AND p.agency_id=m.agency_id WHERE m.agency_id=? AND (JSON_UNQUOTE(JSON_EXTRACT(m.metadata_json,'$.correctionKey'))=? OR (JSON_UNQUOTE(JSON_EXTRACT(m.metadata_json,'$.baselineRowId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(m.metadata_json,'$.sourcePayrollPeriodId'))=?)) LIMIT 1`+(lockRows?' FOR UPDATE':''),[Number(agencyId),key,String(before.id),String(sourcePayrollPeriodId)]);
  if(existing) blockers.push('An adjustment already exists for this original session. Review that line before posting another correction.');
  const review={correctionKey:key,agencyId:Number(agencyId),userId:Number(before.user_id),destinationPeriodId:Number(destinationPeriodId),sourcePayrollPeriodId:Number(sourcePayrollPeriodId),baselineRowId:Number(before.id),rowMatchKey:after?.row_fingerprint || before.row_fingerprint || null,compareRowId:after?Number(after.id):null,
    provider:before.provider_name,client:before.patient_first_name,serviceDate:day(before.service_date),
    original:{code:before.service_code,units:Number(payment?.paidRow.unit_count ?? before.unit_count),noteStatus:before.note_status,payrollPeriodId:payment?.period.id || null,periodStart:day(payment?.period.period_start),periodEnd:day(payment?.period.period_end),postedAt:payment?.period.posted_at || payment?.period.finalized_at || null,proof:payment?.proof || null,baseAmount:original?.baseAmount ?? null,autoIndirectAmount:original?.autoIndirectAmount ?? null,total:originalPay,rate:original?.rate ?? null,rateUnit:original?.rateUnit || null,credits:original?.credits ?? null},
    corrected:{code:after?.service_code || null,units:after?Number(after.unit_count):0,noteStatus:after?.note_status || 'Removed',...corrected,total:correctedPay},
    reductionAmount:reduction,additionalPayAmount:adjustmentAmount!=null?Math.max(0,adjustmentAmount):null,adjustmentAmount,adjustmentType,existingAdjustment:existing || null,canPostAdjustment:blockers.length===0,canPostReduction:blockers.length===0&&adjustmentType==='reduction',canPostAdditionalPay:blockers.length===0&&adjustmentType==='additional_pay',blockers,
    calculationBasis:'Saved original service pay and its automatic indirect pay; replacement valued with its dated compensation snapshot and applicable payroll calculation rules. This is a pay adjustment only.'};
  const tokenData={...review,sourceVersion:summary?.computed_at || null,beforePayable:before.draft_payable,afterPayable:after?.draft_payable};
  review.reviewToken=crypto.createHash('sha256').update(JSON.stringify(tokenData)).digest('hex');
  return review;
}

export async function postPayrollCorrectionAdjustment({agencyId,destinationPeriodId,sourcePayrollPeriodId,baselineRowId,compareRowId,reviewToken,actorUserId,direction},getConnection=()=>pool.getConnection()) {
  const db=await getConnection();
  try {
    await db.beginTransaction();
    const review=await buildPayrollCorrectionReview({agencyId,destinationPeriodId,sourcePayrollPeriodId,baselineRowId,compareRowId,db,lockRows:true});
    if(review.existingAdjustment) {await db.commit();return {alreadyPosted:true,adjustmentId:review.existingAdjustment.id,review};}
    if(!review.canPostAdjustment) fail(review.blockers[0] || 'Review this correction first.');
    if(direction!==review.adjustmentType) fail('The pay direction changed. Refresh the review before posting this adjustment.');
    if(!reviewToken || reviewToken!==review.reviewToken) fail('The source session or payroll calculation changed. Open Review code again before posting.');
    const before=review.original,after=review.corrected;
    const details=[{label:'Service code',value:after.code || before.code},{label:'Provider',value:review.provider},{label:'Client / session',value:review.client},{label:'Date of service',value:review.serviceDate},
      {label:'Original payroll period',value:`${before.periodStart} → ${before.periodEnd}`},{label:'Original payroll posted',value:before.postedAt || 'Posted; timestamp unavailable'},
      {label:'Original session row',value:review.baselineRowId},{label:'Corrected session row',value:review.compareRowId || 'Removed'},
      {label:'Original service code',value:before.code},{label:'Corrected service code',value:after.code || 'Removed'},
      {label:'Original units',value:before.units},{label:'Corrected units',value:after.units},
      {label:'Original service pay',value:before.baseAmount},{label:'Original automatic indirect pay',value:before.autoIndirectAmount},
      {label:'Corrected service pay',value:after.baseAmount},{label:'Corrected automatic indirect pay',value:after.autoIndirectAmount},
      {label:'Previously included pay',value:before.total},{label:'Corrected pay',value:after.total},{label:review.adjustmentType==='reduction'?'Overpayment reduction':'Underpayment addition',value:review.adjustmentAmount},
      {label:'Reason',value:after.code===before.code?`Session quantity corrected from ${before.units} to ${after.units} for ${before.code}`:after.code?`Service code corrected from ${before.code} to ${after.code}`:'Previously paid session removed from the updated report'},
      {label:'Calculation',value:review.calculationBasis}];
    const metadata={kind:review.adjustmentType==='reduction'?'raw_audit_reduction':'raw_audit_adjustment',correctionKey:review.correctionKey,correctionReview:review,overpaymentReview:review,sourcePayrollPeriodId:review.sourcePayrollPeriodId,rowMatchKey:review.rowMatchKey,baselineRowId:review.baselineRowId,compareRowId:review.compareRowId,details,postedByUserId:Number(actorUserId)};
    const[result]=await db.execute(`INSERT INTO payroll_manual_pay_lines (payroll_period_id,agency_id,user_id,line_type,label,category,credits_hours,amount,metadata_json,correction_key,created_by_user_id) VALUES (?,?,?,'pay',?,?,NULL,?,?,?,?)`,
      [Number(destinationPeriodId),Number(agencyId),review.userId,`${review.adjustmentType==='reduction'?'Overpayment reduction':'Underpayment addition'} · ${review.serviceDate} · ${before.code} → ${after.code || 'removed'}`,['indirect','admin','meeting'].includes(before.category)?'indirect':'direct',review.adjustmentAmount,JSON.stringify(metadata),review.correctionKey,Number(actorUserId)]);
    await db.execute('DELETE FROM payroll_summaries WHERE payroll_period_id=? AND agency_id=?',[Number(destinationPeriodId),Number(agencyId)]);
    await db.execute("UPDATE payroll_periods SET status='staged',ran_at=NULL,ran_by_user_id=NULL WHERE id=? AND agency_id=?",[Number(destinationPeriodId),Number(agencyId)]);
    await db.commit();return {alreadyPosted:false,adjustmentId:result.insertId,review};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
}

export function postPayrollCorrectionReduction(args,getConnection) {
  return postPayrollCorrectionAdjustment({...args,direction:'reduction'},getConnection);
}
export function postPayrollCorrectionAdditionalPay(args,getConnection) {
  return postPayrollCorrectionAdjustment({...args,direction:'additional_pay'},getConnection);
}
