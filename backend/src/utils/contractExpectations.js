import { isBachelorsCredentialText } from './credentialNormalization.js';
const text = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
export function contractRoleLabel({jobTitle='',roleType='',role='',credential=''}={}) {
  const roles = `${roleType} ${role}`.toLowerCase();
  if (/intern|practicum|student/.test(`${roles} ${jobTitle} ${credential}`.toLowerCase())) return 'Student';
  if (/facilitat/.test(`${roles} ${jobTitle}`.toLowerCase()) || isBachelorsCredentialText(credential)) return 'Facilitator';
  if (/therap|counsel|provider|clinician|psycholog/.test(`${roles} ${jobTitle}`.toLowerCase())) return 'Provider';
  if (/intern|practicum|student/.test(jobTitle.toLowerCase())) return 'Student';
  return roles.trim() ? 'Employee' : 'Provider';
}
export function sanitizeContractExpectations(raw={}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out={};
  for (const k of ['roleLabel','serviceFocus','schedule','supervisorName','expectedHours','directHours','daysPerWeek']) if (raw[k] !== undefined) out[k]=text(raw[k], k==='schedule'?1000:250);
  if (raw.includeSupervision !== undefined) out.includeSupervision=raw.includeSupervision===true || raw.includeSupervision==='1';
  if (raw.additionalDuties !== undefined) out.additionalDuties=(Array.isArray(raw.additionalDuties)?raw.additionalDuties:[]).slice(0,30).map(d=>({description:text(d.description),payBasis:['direct','indirect','support','hcode','service_code','custom'].includes(d.payBasis)?d.payBasis:'',serviceCode:text(d.serviceCode,30),customRate:text(d.customRate,20),rateUnit:['per_hour','per_unit','per_service'].includes(d.rateUnit)?d.rateUnit:'per_hour'}));
  return out;
}
export function jobContractExpectations(job={}) {
  let config=job.prehire_config_json || {};
  if(typeof config==='string'){try{config=JSON.parse(config);}catch{config={};}}
  return sanitizeContractExpectations({...(job.schedule_text?{schedule:job.schedule_text}:{}),...config.contractDefaults});
}
export function expectationsToTokens(raw) {
  const e=sanitizeContractExpectations(raw),tokens={};
  const keys={roleLabel:'ROLE_LABEL',serviceFocus:'SERVICE_FOCUS',schedule:'SCHEDULE',supervisorName:'SUPERVISOR_NAME',expectedHours:'EXPECTED_HOURS',directHours:'MIN_HOURS',daysPerWeek:'MIN_DAYS_PER_WEEK'};
  for(const [k,t] of Object.entries(keys))if(e[k]!==undefined)tokens[t]=e[k];
  if(e.includeSupervision!==undefined)tokens.INCLUDE_SUPERVISION=e.includeSupervision?'1':'0';
  return tokens;
}
export function expectationsFromTokens(t={}) {
 return sanitizeContractExpectations({roleLabel:t.ROLE_LABEL,serviceFocus:t.SERVICE_FOCUS,schedule:t.SCHEDULE,supervisorName:t.SUPERVISOR_NAME,expectedHours:t.EXPECTED_HOURS,directHours:t.MIN_HOURS,daysPerWeek:t.MIN_DAYS_PER_WEEK,...(t.INCLUDE_SUPERVISION!==undefined?{includeSupervision:String(t.INCLUDE_SUPERVISION)==='1'}:{}),additionalDuties:t.CONTRACT_EXPECTATIONS?.additionalDuties||[]});
}
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderAdditionalExpectations(raw, row={}, serviceRates=[]) {
 const e=sanitizeContractExpectations(raw);
 const lines=[['Expected total work hours per week',e.expectedHours],['Expected direct service hours per week',e.directHours],['Days per week',e.daysPerWeek],['Schedule',e.schedule]].filter(([,v])=>v);
 const duties=(e.additionalDuties||[]).map(d=>{
  if(!d.description || !d.payBasis)throw Object.assign(new Error('Each additional duty needs a description and compensation choice.'),{status:400});
  let rate,unit='per hour';
  const p=row.paySystem||{};
  if(d.payBasis==='service_code'){
   const service=serviceRates.find(r=>r.code===d.serviceCode);
   if(!service)throw Object.assign(new Error(`Configure compensation for service ${d.serviceCode || '(not selected)'}.`),{status:400});
   rate=`${service.rate} ${service.unit}${service.additionalIndirect?`; ${service.additionalIndirect}`:''}${service.reduced?`; probation / reduced: ${service.reduced}`:''}`;
  }else{
   const value=d.payBasis==='custom'?Number(d.customRate):({direct:row.direct_rate,indirect:row.indirect_rate,support:p.supportActivityRate,hcode:p.hcodeRate})[d.payBasis];
   if(value==null||!Number.isFinite(Number(value))||Number(value)<=0)throw Object.assign(new Error(`Configure a positive ${d.payBasis} rate for the additional duty.`),{status:400});
   if(d.payBasis==='custom')unit=d.rateUnit.replaceAll('_',' ');
   rate=`$${Number(value).toFixed(2)} ${unit}`;
  }
  return `<tr><td>${escape(d.description)}</td><td>${escape(d.payBasis==='service_code'?d.serviceCode:d.payBasis==='hcode'?'H-code hourly rate':d.payBasis==='custom'?'Individually agreed rate':d.payBasis)}</td><td>${escape(rate)}</td></tr>`;
 });
 if(!lines.length&&!duties.length)return '';
 return `<section class="contract-expectations"><h2>Individual work expectations and additional duties</h2>${lines.map(([k,v])=>`<p><strong>${k}:</strong> ${escape(v)}</p>`).join('')}${duties.length?`<table><thead><tr><th>Additional duty</th><th>Compensation basis</th><th>Agreed rate</th></tr></thead><tbody>${duties.join('')}</tbody></table><p>These assignments remain subject to the individual’s qualifications, authorized scope, and applicable supervision. Record all work time in the app. A service-code compensation choice does not authorize billing an insurer for an ineligible service.</p>`:''}</section>`;
}
