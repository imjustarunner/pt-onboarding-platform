import pool from '../config/database.js';
import { isSupervisorActor } from '../utils/supervisorSchoolAccess.js';
import { readSubmissionAnswers } from './officeClientSubmissions.service.js';
import { scoreOfficeFeedback } from './officeFeedbackForms.js';

const staffRoles = new Set(['admin','support','staff','clinical_practice_assistant']);
const clinicalRoles = new Set(['provider','provider_plus','intern','intern_plus','supervisor','clinician']);
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const fail = (status,message) => Object.assign(new Error(message),{status});
const instant = value => value instanceof Date ? value : new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : String(value).replace(' ','T')+'Z');
const round = value => Math.round(value*10)/10;
const mean = values => values.length ? round(values.reduce((a,b)=>a+b,0)/values.length) : null;

// Authorization is applied before encrypted answers are read. A provider filter
// narrows results; it never grants access to another provider's caseload.
export async function readAccessibleFeedback({user,clientIds,providerId=null}) {
 if(!Array.isArray(clientIds)||!clientIds.length||clientIds.length>200||clientIds.some(id=>!Number.isSafeInteger(id)||id<=0))throw fail(400,'Choose between 1 and 200 clients.');
 if(providerId!=null&&(!Number.isSafeInteger(providerId)||providerId<=0))throw fail(400,'Invalid provider.');
 const role=String(user.role||'').toLowerCase(),superAdmin=role==='super_admin',staff=staffRoles.has(role);
 const supervisor=await isSupervisorActor({userId:user.id,role,user});
 if(!superAdmin&&!staff&&!clinicalRoles.has(role)&&!supervisor)throw fail(403,'Client feedback access is required.');
 const params=[...new Set(clientIds)];
 const clauses=[`s.client_id IN (${params.map(()=>'?').join(',')})`,'s.agency_id=c.agency_id'];
 if(!superAdmin){
  clauses.push('EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=? AND ua.agency_id=s.agency_id AND ua.is_active=1)');params.push(user.id);
  if(!staff){
   clauses.push(`(c.provider_id=s.provider_id OR EXISTS(SELECT 1 FROM client_provider_assignments ca WHERE ca.client_id=c.id AND ca.provider_user_id=s.provider_id AND ca.is_active=1))`);
   clauses.push(`(s.provider_id=?${supervisor?' OR EXISTS(SELECT 1 FROM supervisor_assignments sa WHERE sa.supervisor_id=? AND sa.supervisee_id=s.provider_id AND sa.agency_id=s.agency_id)':''})`);params.push(user.id);if(supervisor)params.push(user.id);
  }
 }
 if(providerId!=null){clauses.push('s.provider_id=?');params.push(providerId);}
 const [rows]=await pool.execute(`SELECT s.id,s.client_id,s.provider_id,s.scheduled_start_at,s.forms_json,s.answers_json,s.completed_at,l.name location_name,l.timezone,u.first_name provider_first_name,u.last_name provider_last_name FROM office_client_checkin_submissions s JOIN clients c ON c.id=s.client_id JOIN office_locations l ON l.id=s.office_location_id JOIN users u ON u.id=s.provider_id WHERE ${clauses.join(' AND ')} ORDER BY s.scheduled_start_at,s.id LIMIT 20001`,params);
 if(rows.length>20000)throw fail(422,'Select fewer clients to load the full feedback history.');
 return rows.map(row=>{
  const envelope=json(row.forms_json),feedback=readSubmissionAnswers(row.answers_json);
  return {id:row.id,clientId:row.client_id,providerId:row.provider_id,providerName:[row.provider_first_name,row.provider_last_name].filter(Boolean).join(' '),scheduledStartAt:row.scheduled_start_at,location:row.location_name,timezone:row.timezone,completedAt:row.completed_at,respondentType:envelope.respondentType,serviceType:envelope.serviceType||'counseling',forms:envelope.forms,answers:feedback.answers,skippedFormIds:feedback.skippedFormIds,score:scoreOfficeFeedback(envelope.forms,feedback.answers,feedback.skippedFormIds)};
 });
}

export function summarizeFeedback(visits,now=new Date()) {
 const cutoff=+now-42*86400000,groups=new Map();
 for(const visit of visits){
  if(!visit.completedAt||+instant(visit.scheduledStartAt)>+now)continue;
  const key=[visit.clientId,visit.providerId,visit.serviceType,visit.respondentType].join(':');
  if(!groups.has(key))groups.set(key,{key,clientId:visit.clientId,providerId:visit.providerId,providerName:visit.providerName,serviceType:visit.serviceType,respondentType:visit.respondentType,visits:[]});
  groups.get(key).visits.push(visit);
 }
 return [...groups.values()].map(({visits:history,...group})=>{
  history.sort((a,b)=>+instant(a.scheduledStartAt)-+instant(b.scheduledStartAt)||a.id-b.id);
  const metrics={};
  for(const metric of ['connection','progress']){
   const scored=history.filter(v=>Number.isFinite(v.score?.[metric]));
   const recent=scored.filter(v=>+instant(v.scheduledStartAt)>=cutoff);
   const last=scored.at(-1),first=recent[0],end=recent.at(-1);
   metrics[metric]={current:last?.score[metric]??null,currentAt:last?.scheduledStartAt??null,average:mean(scored.map(v=>v.score[metric])),count:scored.length,sixWeekAverage:mean(recent.map(v=>v.score[metric])),sixWeekCount:recent.length,change:recent.length>1&&+instant(end.scheduledStartAt)>+instant(first.scheduledStartAt)?round(end.score[metric]-first.score[metric]):null,fromAt:first?.scheduledStartAt??null,toAt:end?.scheduledStartAt??null};
  }
  return {...group,metrics};
 });
}
