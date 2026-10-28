import pool from '../config/database.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollCompensationLevel from '../models/PayrollCompensationLevel.model.js';
import PayrollPaySystemRate from '../models/PayrollPaySystemRate.model.js';
import { effectiveCompensationAgreement } from './employmentAgreementPolicy.service.js';
import { defaultHcodeIndirectMinutes } from '../utils/serviceCreditPolicy.js';
import {RESTRICTED_CODES,codeRestriction} from '../content/handbookCodePresentation.js';
import {day} from './recurringPayroll.service.js';
const parse=v=>{try{return typeof v==='string'?JSON.parse(v):v||{};}catch{return {};}};
export async function submissionContext({agencyId,userId,asOf=day(new Date())}) {
 const [assignment,adminRate,agreement,agencyEnabled]=await Promise.all([
  PayrollCompensationLevel.getForUser(agencyId,userId),
  PayrollRate.findBestRate({agencyId,userId,serviceCode:'Admin Time',asOf}),
  effectiveCompensationAgreement({agencyId,userId,asOfDate:asOf}),
  PayrollPaySystemRate.isAgencyEnabled(agencyId)
 ]);
 const [[draft]]=await pool.execute("SELECT token_values_json FROM contract_generations WHERE agency_id=? AND candidate_user_id=? AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' ORDER BY id DESC LIMIT 1",[agencyId,userId]);
 const data=agreement?.data||parse(draft?.token_values_json),schedule=data.schedule||null;
 const role=data.roleCompensation?.cpa||data.roleCompensation?.mentor;
 const starts=[day(assignment?.pay_system_effective_start),day(agreement?.effectiveOn||data.effectiveDate)].filter(Boolean).sort().at(-1)||null;
 const admin=Number(role?.adminRate ?? adminRate?.rate_amount);
 return {assignment,schedule,startsOn:starts,executed:!!agreement&&agreement.executed!==false,payrollAuthorized:!!agreement?.payrollAuthorized,adminRate:admin>0?admin:null,
  indirectMinutesPerHour:schedule?Number(schedule.autoIndirectMinutes??defaultHcodeIndirectMinutes(schedule.category)):0,
  effective:!!agencyEnabled&&Number(assignment?.pay_system_enabled)===1&&!!agreement&&!!schedule&&!!starts&&asOf>=starts};
}
export function compensationCodes(rules,agencyId) {
 return rules.filter(r=>/^(9|H)\d/.test(r.service_code)&&r.category==='direct'&&Number(r.credit_value)>0).map(r=>{
  const code=r.service_code,h=code.startsWith('H'),restricted=Number(agencyId)===2&&RESTRICTED_CODES.includes(code);
  const perMinute=h&&Math.abs(Number(r.credit_value)-1/60)<1e-7;
  return {code,group:h?'direct_care':'clinical_session',creditValue:Number(r.credit_value),basis:perMinute?'minutes':h?'units':'credits',
   quantityLabel:perMinute?'Documented service minutes ÷ 60':h?`${Number(r.credit_value).toFixed(2)} direct hours per verified unit`:`${Number(r.credit_value).toFixed(2)} credits per service`,restricted,status:restricted?codeRestriction(code):'Subject to approved scope, setting and payer requirements'};
 });
}
export function excessIndirect({units,actualMinutes,hoursPerUnit,minutesPerHour}) {
 const values=[units,actualMinutes,hoursPerUnit,minutesPerHour].map(Number);
 if(values.some(n=>!Number.isFinite(n)||n<0)||values[2]<=0)throw Object.assign(new Error('Enter valid quantities and actual indirect minutes'),{status:400});
 const included=values[0]*values[2]*values[3];
 return {includedMinutes:Math.round(included*100)/100,excessMinutes:Math.round(Math.max(0,values[1]-included)*100)/100};
}
export async function validateSupplementalTime({agencyId,userId,claimDate,payload}) {
 const ctx=await submissionContext({agencyId,userId,asOf:claimDate});
 if(payload.categoryGroup==='admin_duties') {
  if(!ctx.adminRate)throw Object.assign(new Error('No administrative-duty rate is assigned. Contact payroll to confirm your assignment.'),{status:403});
  if(String(payload.description||'').trim().length<5||String(payload.purpose||'').trim().length<3)throw Object.assign(new Error('Describe the administrative work and what assignment or purpose it supported.'),{status:400});
 }
 if(payload.excessIndirect) {
  const x=payload.excessIndirect;
  const [[rule]]=await pool.execute('SELECT * FROM payroll_service_code_rules WHERE agency_id=? AND service_code=?',[agencyId,x.code]);
  if(!ctx.effective||!rule||!/^H\d/.test(rule.service_code)||!(Number(rule.credit_value)>0))throw Object.assign(new Error('Confirm the dated Direct Care Rate and service mapping before submitting excess time.'),{status:409});
  const calc=excessIndirect({units:x.units,actualMinutes:x.actualMinutes,hoursPerUnit:rule.credit_value,minutesPerHour:ctx.indirectMinutesPerHour});
  if(calc.excessMinutes<=0||!Number.isFinite(Number(payload.totalMinutes))||Math.abs(Number(payload.totalMinutes)-calc.excessMinutes)>0.01)throw Object.assign(new Error('Submit only the indirect minutes above the automatic allowance.'),{status:400});
  payload.excessIndirect={...x,...calc,minutesPerHour:ctx.indirectMinutesPerHour};
 }
 if(ctx.effective && payload.categoryGroup==='indirect_service' && !payload.excessIndirect && payload.excludesAutomaticIndirect!==true)throw Object.assign(new Error('Confirm this time excludes the indirect allowance already included with billed services.'),{status:400});
 return ctx;
}
