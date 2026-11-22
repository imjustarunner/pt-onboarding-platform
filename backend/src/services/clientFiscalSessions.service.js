import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import {visibleClinicalWork} from './clinicalWorkArchiveRead.service.js';

export const codeOf=value=>String(value||'').trim().toUpperCase().split(/[ :,-]/)[0];
// Identifiable behavioral-health services. Unknown codes stay visible for review.
export const isMentalHealthCode=value=>/^(9079[12]|908\d{2}|961(5[6-9]|6[4-9]|7[01])|H\d{4}|T101[567])$/.test(codeOf(value));
const psychotherapyCodes=new Set(['90832','90833','90834','90836','90837','90838','90846','90847','90849','90853']);
const addOn=new Set(['90833','90836','90838','90840','90785']);
const ymd=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
export function clinicalToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function sessionServiceDay(value,zone='America/Denver'){
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const raw=value instanceof Date?value:new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(String(value))?value:String(value).replace(' ','T')+'Z');
  if(!Number.isFinite(raw.getTime()))return '';
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:zone||'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(raw);}catch{return ''; }
}
export function fiscalPeriod(today=clinicalToday()) {
  const year=Number(today.slice(0,4))-(today.slice(5,7)<'07'?1:0);
  return {start:`${year}-07-01`,end:`${year+1}-06-30`,today};
}
// Explicit encounter/appointment links collapse representations of one visit.
// Distinct same-day sessions remain separate; units never multiply a visit.
export function summarizeFiscalSessions({sessions=[],encounters=[],appointments=[],baseline=null,period=fiscalPeriod()}) {
  const groups=new Map(),parents=new Map();let unknown=0;
  const root=k=>{if(!parents.has(k))parents.set(k,k);const p=parents.get(k);if(p===k)return k;const r=root(p);parents.set(k,r);return r;};
  const rows=[...sessions.map(s=>({date:s.service_date?ymd(s.service_date):sessionServiceDay(s.scheduled_start_at,s.source_timezone),code:s.service_code,imported:!!s.billing_encounter_id,
    keys:[`s:${s.id}`,s.appointment_id&&`a:${s.appointment_id}`,s.office_event_id&&`o:${s.office_event_id}`,s.billing_encounter_id&&`b:${s.billing_encounter_id}`].filter(Boolean)})),
    ...encounters.map(e=>({date:ymd(e.service_date),code:e.service_code,imported:true,keys:[`b:${e.id}`,e.clinical_session_id&&`s:${e.clinical_session_id}`].filter(Boolean)})),
    ...appointments.map(a=>({date:sessionServiceDay(a.start_at,a.source_timezone),clinicalAppointment:true,imported:false,keys:[`a:${a.id}`,a.clinical_session_id&&`s:${a.clinical_session_id}`,a.office_event_id&&`o:${a.office_event_id}`].filter(Boolean)}))];
  for(const row of rows)for(const key of row.keys.slice(1))parents.set(root(key),root(row.keys[0]));
  for(const row of rows){if(row.date<period.start||row.date>period.today)continue;
    if(!row.clinicalAppointment&&!isMentalHealthCode(row.code)){unknown++;continue;}if(addOn.has(codeOf(row.code)))continue;
    const key=root(row.keys[0]),existing=groups.get(key);
    if(existing){existing.imported=existing.imported||row.imported;existing.psychotherapy=existing.psychotherapy||psychotherapyCodes.has(codeOf(row.code));existing.date=existing.date<row.date?existing.date:row.date;}
    else groups.set(key,{date:row.date,imported:row.imported,psychotherapy:psychotherapyCodes.has(codeOf(row.code))});
  }
  const through=baseline?ymd(baseline.through_date):null;
  const counted=[...groups.values()].filter(row=>!through||row.date>through);
  const imported=counted.filter(row=>row.imported).length;
  const psychotherapyTotal=counted.filter(row=>row.psychotherapy).length+Number(baseline?.psychotherapy_count||0);
  return {period,psychotherapyTotal,psychotherapyCountIncomplete:!!baseline && baseline.psychotherapy_count==null,psychotherapyReviewSuggested:psychotherapyTotal>=24,total:counted.length+Number(baseline?.session_count||0),recorded:counted.length,imported,unknownCodeRows:unknown,
    baseline:baseline?{id:Number(baseline.id),count:Number(baseline.session_count),psychotherapyCount:baseline.psychotherapy_count==null?null:Number(baseline.psychotherapy_count),throughDate:through,reason:baseline.reason,createdAt:baseline.created_at,actorUserId:baseline.actor_user_id}:null,
    reviewSuggested:counted.length+Number(baseline?.session_count||0)>=24};
}
export async function loadClientFiscalSessions({agencyId,clientId},mainDb=pool,careDb=clinicalPool) {
  const period=fiscalPeriod(),queryStart=new Date(Date.parse(period.start)-86400000).toISOString().slice(0,10),queryEnd=new Date(Date.parse(period.today)+2*86400000).toISOString().slice(0,10);
  const results=await Promise.allSettled([
    careDb.execute(`SELECT id,appointment_id,office_event_id,billing_encounter_id,scheduled_start_at,source_timezone,service_code
      FROM clinical_sessions WHERE agency_id=? AND client_id=? AND encounter_status='completed'
      AND scheduled_start_at>=? AND scheduled_start_at<DATE_ADD(?,INTERVAL 1 DAY)`,[agencyId,clientId,queryStart,queryEnd]),
    mainDb.execute(`SELECT id,clinical_session_id,service_date,service_code FROM billing_encounters
      WHERE agency_id=? AND client_id=? AND service_date BETWEEN ? AND ?`,[agencyId,clientId,period.start,period.today]),
    mainDb.execute(`SELECT * FROM client_fiscal_session_history WHERE agency_id=? AND client_id=? AND fiscal_start=? ORDER BY id DESC LIMIT 10`,[agencyId,clientId,period.start]),
    mainDb.execute(`SELECT DISTINCT a.id,a.start_at,a.source_timezone,a.clinical_session_id,a.office_event_id FROM appointments a
      JOIN appointment_participants p ON p.appointment_id=a.id AND p.client_id=? AND p.role IN ('client','student')
      WHERE a.agency_id=? AND a.status='completed' AND LOWER(a.business_type) IN ('clinical','counseling','therapy','mental_health','behavioral_health')
      AND a.start_at>=? AND a.start_at<DATE_ADD(?,INTERVAL 1 DAY)`,[clientId,agencyId,queryStart,queryEnd])
  ]);
  for(const [index,kind] of [[0,'clinical_session'],[1,'billing_encounter'],[3,'appointment']]){
    if(results[index].status!=='fulfilled')continue;
    try {results[index].value[0]=await visibleClinicalWork(results[index].value[0],{db:mainDb,kind});}
    catch(reason){results[index]={status:'rejected',reason};}
  }
  const get=i=>results[i].status==='fulfilled'?results[i].value[0]:[];
  return {...summarizeFiscalSessions({sessions:get(0),encounters:get(1),appointments:get(3),baseline:get(2)[0]||null,period}),history:get(2).map(row=>({id:row.id,count:row.session_count,psychotherapyCount:row.psychotherapy_count,throughDate:ymd(row.through_date),reason:row.reason,createdAt:row.created_at,actorUserId:row.actor_user_id})),unavailable:results.some(r=>r.status==='rejected')};
}
export function validateFiscalBaseline(input,today=clinicalToday()) {
  const period=fiscalPeriod(today),through=String(input.throughDate||''),count=input.count,psychotherapyCount=input.psychotherapyCount==null||input.psychotherapyCount===''?null:input.psychotherapyCount,reason=String(input.reason||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(through)||!Number.isFinite(Date.parse(through))||ymd(new Date(through))!==through||through<period.start||through>today||!Number.isSafeInteger(count)||count<0||count>10000||psychotherapyCount!==null&&(!Number.isSafeInteger(psychotherapyCount)||psychotherapyCount<0||psychotherapyCount>count)||reason.length<5||reason.length>1000)
    throw Object.assign(new Error('Enter a verified session total, a date within the current fiscal year through today, and its source or reason (5–1000 characters).'),{status:400});
  return {period,through,count,psychotherapyCount,reason};
}
export async function recordFiscalBaseline({agencyId,clientId,actorUserId,input},db=pool) {
  const {period,through,count,psychotherapyCount,reason}=validateFiscalBaseline(input);
  const conn=await db.getConnection();
  try{await conn.beginTransaction();
    const [[client]]=await conn.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[clientId]);
    if(!client)throw Object.assign(new Error('Client not found.'),{status:404});
    const [[latest]]=await conn.execute('SELECT id FROM client_fiscal_session_history WHERE agency_id=? AND client_id=? AND fiscal_start=? ORDER BY id DESC LIMIT 1',[agencyId,clientId,period.start]);
    if(Number(latest?.id||0)!==Number(input.expectedRevisionId||0))throw Object.assign(new Error('This total changed. Refresh the overview before saving.'),{status:409});
    await conn.execute('INSERT INTO client_fiscal_session_history (agency_id,client_id,fiscal_start,through_date,session_count,psychotherapy_count,reason,actor_user_id) VALUES (?,?,?,?,?,?,?,?)',[agencyId,clientId,period.start,through,count,psychotherapyCount,reason,actorUserId]);
    await conn.commit();
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}
