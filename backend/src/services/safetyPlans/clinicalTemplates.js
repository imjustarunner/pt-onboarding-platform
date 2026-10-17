import {cssrsTemplate,validateCssrsComplete} from './cssrs.js';
import {buildCounselingSelfEnSteps} from '../../data/counselingIntakeSelfEn.js';
import AgencyOfficeIntakeMaster from '../../models/AgencyOfficeIntakeMaster.model.js';
import {safetyPlanTemplate,normalizeSafetyPlan,validateReady,fail} from './template.js';
const field=(key,label,type='textarea',options)=>[key,label,{type,...(options?{options}: {})}];
export const clinicalFormCatalog=[
 {key:'cssrs-screener',title:'C-SSRS · Suicide ideation screener'},
 {key:'safety-plan',title:'Safety plan'},
 {key:'release-of-information',title:'Release of information'},
 {key:'client-information-update',title:'Client information update'},
 {key:'attendance-verification',title:'Appointment attendance verification'}
];
const roi={key:'release-of-information',version:'2026-10-11.1',title:'Release of information',description:'Authorization to release and exchange specified health information. Staff review the scope and recipient before any disclosure. Signing this form does not send records or change portal permissions.',
 sections:[
 {title:'Client and representative',fields:[field('birthDate','Client date of birth','date'),field('clientPhone','Client phone','tel'),field('clientEmail','Client email','email'),field('guardianName','Parent / guardian or authorized representative','text'),field('guardianPhone','Representative phone','tel'),field('representativeAuthority','Relationship and authority to act for the client','text'),field('providerName','Agency provider','text')]},
 {title:'Recipient and purpose',fields:[field('recipientName','Person or organization receiving / exchanging information','text'),field('recipientPhone','Recipient phone','tel'),field('recipientEmail','Recipient email','email'),field('recipientAddress','Recipient mailing address'),field('direction','What is authorized?','multi',['Discuss information with the named recipient','Send specified records to the named recipient','Receive specified records from the named recipient','Provide a copy to the client']),field('purpose','Purpose of this disclosure')]},
 {title:'Information authorized',fields:[field('information','Choose the information covered','multi',['Clinical record, excluding psychotherapy notes and records requiring separate authorization','Summary of sessions and treatment','Billing summary','Dates and charges of services','Other information described below']),field('fromDate','Records from','date'),field('throughDate','Records through','date'),field('otherInformation','Other information / exclusions / limits')]},
 {title:'Expiration and your rights',fields:[field('expirationDate','Expiration date (or describe an expiration event below)','date'),field('expirationEvent','Expiration event, if applicable')],notice:'You may revoke this authorization in writing through your care team or use Revoke authorization in your portal. Revocation does not undo actions already taken in reliance on this authorization. Treatment, payment, enrollment, and eligibility for benefits are not conditioned on signing this optional release. Information disclosed to a recipient may be redisclosed and may no longer be protected by HIPAA. Psychotherapy notes and records requiring a separate authorization are excluded from this form; staff must use the applicable separate process. You may receive a copy of the signed authorization.'}
 ],references:[{title:'HHS · Authorization requirements',url:'https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/standards-privacy-individually-identifiable-health-information/index.html'}]};
const attendance={key:'attendance-verification',version:'2026-10-11.1',title:'Appointment attendance verification',description:'A brief attendance letter for the client to share with a school or employer. Verify the actual attendance and time before signing. A booking alone is not proof of attendance.',sections:[
 {title:'Appointment details',fields:[field('appointmentDate','Appointment date','date'),field('startTime','Attendance start time','time'),field('endTime','Attendance end time','time'),field('timezone','Time zone','text'),field('location','Appointment location or virtual visit','text'),field('attendanceStatus','Attendance verified by staff','select',['Confirmed attended','Not yet confirmed']),field('excuseRequested','Request absence to be excused','select',['Yes','No']),field('absenceFrom','Requested absence begins','time'),field('absenceThrough','Requested absence ends','time')]},
 {title:'Issuing staff',fields:[field('issuerName','Staff name','text'),field('issuerTitle','Actual role / credentials','text'),field('contactPhone','Agency contact phone','tel')],notice:'This document confirms attendance only. It does not include diagnosis, treatment details, fitness-for-duty clearance, or a guarantee that a school or employer will excuse an absence.'}
]};
// Reuse contact questions from the existing clinical enrollment, never a new clinical assessment.
const updateKeys=new Set(['legal_first_name','legal_last_name','preferred_name','date_of_birth','phone_number','email_address','preferred_language','address_street','address_zip','address_city','address_state','preferred_contact_method','best_time_to_contact','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone']);
export async function getClinicalTemplate(key='safety-plan',agencyId){
 if(key==='cssrs-screener')return cssrsTemplate;
 if(key==='safety-plan')return safetyPlanTemplate;
 if(key==='release-of-information')return roi;
 if(key==='attendance-verification')return attendance;
 if(key!=='client-information-update')fail(400,'Select a supported clinical form.');
 const canonical=buildCounselingSelfEnSteps()[0].fields.filter(f=>updateKeys.has(f.key));
 const master=await AgencyOfficeIntakeMaster.findByAgencyLanguage(agencyId,'en');
 const custom=[...(Array.isArray(master?.intake_fields)?master.intake_fields:[]),...(Array.isArray(master?.intake_steps)?master.intake_steps:[]).flatMap(s=>s.fields||[])];
 const fields=canonical.map(f=>{const candidate=custom.find(c=>c.key===f.key);return candidate?.label?{...f,...candidate}:f;});
 return {key,version:'2026-10-11.1',title:'Client information update',source:{kind:'clinical-enrollment-contact-questions',masterId:master?.id||null,masterVersion:master?.version||null},description:'Answer for the named client, including when completing this form as their representative. Update the information you want your care team to review. Leave unchanged items blank. Submitted updates are saved for staff review and do not automatically change the medical record. Do not use this form for urgent concerns.',sections:[{title:'Contact and emergency information',fields:fields.map(f=>field(f.key,f.label,['checkbox','multi_select'].includes(f.type)?'multi':['radio','select'].includes(f.type)?'select':f.type,f.options?.length?f.options:undefined))},{title:'Anything else to update',fields:[field('updateNotes','Other changes you would like the care team to review')]}]};
}
const clean=(v,max=6000)=>{if(v==null)return '';if(typeof v!=='string'||v.length>max)fail(400,'Enter text within the field limit.');return v.trim();};
export function normalizeClinicalData(input,template){
 if(template.key==='safety-plan')return normalizeSafetyPlan(input);
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Complete the form.');
 const out={documentName:clean(input.documentName,160),personLabel:clean(input.personLabel,200),planDate:clean(input.planDate,10)};
 for(const section of template.sections)for(const [key,,spec={}] of section.fields||[]){
  if(spec.showIf&&input[spec.showIf.fieldKey]!==spec.showIf.equals){out[key]='';continue;}
  const options=(spec.options||[]).map(o=>typeof o==='string'?o:String(o.value));
  if(spec.type==='multi'){if(input[key]!=null&&!Array.isArray(input[key]))fail(400,'Choose the applicable options.');out[key]=[...new Set(input[key]||[])];if(out[key].some(v=>!options.includes(v)))fail(400,'Select a listed option.');}
  else {out[key]=clean(input[key]);if(['select','radio'].includes(spec.type)&&out[key]&&!options.includes(out[key]))fail(400,'Select a listed option.');if(spec.type==='date'&&out[key]&&!validDate(out[key]))fail(400,'Enter a valid date.');if(spec.type==='time'&&out[key]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(out[key]))fail(400,'Enter a valid time.');}
 }
 if(out.planDate&&!validDate(out.planDate))fail(400,'Enter a valid date.');
 if(template.key==='cssrs-screener'&&out.screenStatus==='completed')validateCssrsComplete(out);
 return out;
}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(+new Date(v))&&new Date(v).toISOString().slice(0,10)===v;}
export function validateClinicalReady(data,template){
 if(template.key==='safety-plan')return validateReady(data);
 if(!data.personLabel||!data.planDate)fail(400,'Enter the client name and document date.');
 if(template.key==='cssrs-screener')validateCssrsComplete(data);
 if(template.key==='release-of-information'){
  if(!data.recipientName||!(data.recipientPhone||data.recipientEmail||data.recipientAddress)||!data.purpose||!data.direction?.length||!data.information?.length||!(data.expirationDate||data.expirationEvent))fail(400,'Complete the recipient, contact, purpose, information, direction, and expiration before signing.');
  if(data.expirationDate&&data.expirationDate<new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))fail(400,'This authorization has expired. Create a current authorization.');
  if(data.information?.includes('Other information described below')&&!data.otherInformation)fail(400,'Describe the other information authorized for release.');
  if(data.information?.includes('Dates and charges of services')&&(!data.fromDate||!data.throughDate))fail(400,'Specify the service date range authorized for release.');
  if(data.expirationDate&&data.expirationDate<data.planDate)fail(400,'Expiration cannot precede the authorization date.');
  if(data.throughDate&&data.fromDate&&data.throughDate<data.fromDate)fail(400,'The record end date cannot precede the start date.');
 }
 if(template.key==='attendance-verification'){
  if(!data.appointmentDate||!data.startTime||!data.endTime||!data.timezone||!data.location||!data.issuerName||!data.issuerTitle||data.attendanceStatus!=='Confirmed attended')fail(400,'Confirm actual attendance, location, time, and issuing staff before signing.');
  if(data.absenceFrom&&data.absenceThrough&&data.absenceThrough<=data.absenceFrom)fail(400,'The absence end time must follow its start time.');
  if(data.endTime<=data.startTime)fail(400,'Attendance end time must follow the start time.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(data.appointmentDate>today)fail(400,'Attendance cannot be verified for a future appointment.');
 }
}
