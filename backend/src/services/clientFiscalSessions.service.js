import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import {visibleClinicalWork} from './clinicalWorkArchiveRead.service.js';

export const codeOf=value=>String(value||'').trim().toUpperCase().split(/[ :,-]/)[0];
// Identifiable behavioral-health services. Unknown codes stay visible for review.
export const isMentalHealthCode=value=>/^(9079[12]|908\d{2}|961(5[6-9]|6[4-9]|7[01])|H\d{4}|T101[567])$/.test(codeOf(value));
const psychotherapyCodes=new Set(['90832','90833','90834','90836','90837','90838','90846','90847','90849','90853']);
// Psychotherapy add-ons paired with an E/M service (90833/36/38) identify a
// therapy visit. Complexity and extra crisis time do not identify another visit.
const addOn=new Set(['90840','90785']);
export const isNonStandaloneVisitCode=value=>addOn.has(codeOf(value));
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
export function summarizeFiscalSessions({sessions=[],encounters=[],appointments=[],observations=[],baseline=null,period=fiscalPeriod()}) {
  const groups=new Map(),parents=new Map();let unknown=0;
  const root=k=>{if(!parents.has(k))parents.set(k,k);const p=parents.get(k);if(p===k)return k;const r=root(p);parents.set(k,r);return r;};
  const rows=[...sessions.map(s=>({date:s.service_date?ymd(s.service_date):sessionServiceDay(s.scheduled_start_at,s.source_timezone),code:s.service_code,provider:Number(s.provider_user_id)||0,imported:!!s.billing_encounter_id,
    keys:[`s:${s.id}`,s.appointment_id&&`a:${s.appointment_id}`,s.office_event_id&&`o:${s.office_event_id}`,s.billing_encounter_id&&`b:${s.billing_encounter_id}`].filter(Boolean)})),
    ...encounters.map(e=>({date:ymd(e.service_date),code:e.service_code,provider:Number(e.provider_user_id)||0,imported:true,keys:[`b:${e.id}`,e.clinical_session_id&&`s:${e.clinical_session_id}`].filter(Boolean)})),
    ...appointments.map(a=>({date:sessionServiceDay(a.start_at,a.source_timezone),provider:Number(a.provider_user_id)||0,clinicalAppointment:true,imported:false,keys:[`a:${a.id}`,a.clinical_session_id&&`s:${a.clinical_session_id}`,a.office_event_id&&`o:${a.office_event_id}`].filter(Boolean)}))];
  for(const row of rows)for(const key of row.keys.slice(1))parents.set(root(key),root(row.keys[0]));
  for(const row of rows){if(row.date<period.start||row.date>period.today)continue;
    if(!row.clinicalAppointment&&!isMentalHealthCode(row.code)){unknown++;continue;}if(addOn.has(codeOf(row.code)))continue;
    const key=root(row.keys[0]),existing=groups.get(key),code=isMentalHealthCode(row.code)?codeOf(row.code):null;
    if(existing){existing.imported ||= row.imported;existing.psychotherapy ||= psychotherapyCodes.has(code);existing.date=existing.date<row.date?existing.date:row.date;if(code)existing.codes.add(code);if(row.provider)existing.providers.add(row.provider);}
    else groups.set(key,{date:row.date,imported:row.imported,psychotherapy:psychotherapyCodes.has(code),codes:new Set(code?[code]:[]),providers:new Set(row.provider?[row.provider]:[])});
  }
  const through=baseline?ymd(baseline.through_date):null;
  const counted=[...groups.values()].filter(row=>!through||row.date>through);
  // A report without a shared platform encounter ID is evidence, not a second
  // encounter. Reconcile its daily multiplicity against known visits. Keep the
  // uncertainty visible; never treat units as encounters or sum overlapping files.
  const reports=new Map(),providerIds=new Set(counted.flatMap(r=>[...r.providers]));
  for(const row of observations){const date=ymd(row.service_date),code=codeOf(row.service_code),provider=Number(row.provider_user_id)||0;
    if(date<period.start||date>period.today||through&&date<=through)continue;
    if(!isMentalHealthCode(code)){unknown++;continue;}if(addOn.has(code))continue;
    providerIds.add(provider);const key=`${date}:${provider}:${code}`;
    if(!reports.has(key))reports.set(key,{date,provider,code,count:0});reports.get(key).count=Math.max(reports.get(key).count,Number(row.reported_sessions)||0);
  }
  let reportAdded=0,reportReview=0,psychotherapyAdded=0;
  const perCode={};for(const visit of counted){const code=[...visit.codes].sort()[0]||'UNCLASSIFIED';perCode[code]=(perCode[code]||0)+1;}
  const allocated=new Set();
  for(const report of reports.values()){
    const candidates=counted.map((visit,index)=>({visit,index})).filter(({visit:v,index})=>!allocated.has(index)&&v.date===report.date && (!v.providers.size||v.providers.has(report.provider)) && (!v.codes.size||v.codes.has(report.code))).sort((a,b)=>b.visit.codes.size-a.visit.codes.size);
    const known=Math.min(candidates.length,report.count);for(const item of candidates.slice(0,known))allocated.add(item.index);
    const added=Math.max(0,report.count-known);reportAdded+=added;reportReview+=report.count;
    perCode[report.code]=(perCode[report.code]||0)+added;if(psychotherapyCodes.has(report.code))psychotherapyAdded+=added;
  }
  if(baseline?.session_count)perCode.VERIFIED_HISTORY=Number(baseline.session_count);
  const psychotherapyTotal=counted.filter(row=>row.psychotherapy).length+psychotherapyAdded+Number(baseline?.psychotherapy_count||0);
  const total=counted.length+reportAdded+Number(baseline?.session_count||0);
  return {period,total,perCode,providerIds:[...providerIds].filter(Boolean),recorded:counted.length,imported:counted.filter(row=>row.imported).length,reportAdded,reportReview,unknownCodeRows:unknown,
    psychotherapyTotal,psychotherapyCountIncomplete:!!baseline && baseline.psychotherapy_count==null,psychotherapyReviewSuggested:psychotherapyTotal>=24,
    baseline:baseline?{id:Number(baseline.id),count:Number(baseline.session_count),psychotherapyCount:baseline.psychotherapy_count==null?null:Number(baseline.psychotherapy_count),throughDate:through,reason:baseline.reason,createdAt:baseline.created_at,actorUserId:baseline.actor_user_id}:null,reviewSuggested:total>=24};
}

/** One agency-scoped read model for charts, caseloads and compliance. A provider
 * filter selects clients; their totals still include all providers in the agency. */
export async function loadAgencyFiscalSessions({agencyId,clientIds=null,period=fiscalPeriod()},mainDb=pool,careDb=clinicalPool) {
  const ids=clientIds?[...new Set(clientIds.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))]:null;
  if(ids&&!ids.length)return new Map();
  const scope=column=>ids?` AND ${column} IN (${ids.map(()=>'?').join(',')})`:'';
  const args=ids||[],queryStart=new Date(Date.parse(period.start)-86400000).toISOString().slice(0,10),queryEnd=new Date(Date.parse(period.today)+2*86400000).toISOString().slice(0,10);
  const results=await Promise.allSettled([
    careDb.execute(`SELECT id,client_id,provider_user_id,appointment_id,office_event_id,billing_encounter_id,scheduled_start_at,source_timezone,service_code FROM clinical_sessions WHERE agency_id=? AND encounter_status='completed' AND scheduled_start_at>=? AND scheduled_start_at<?${scope('client_id')}`,[agencyId,queryStart,queryEnd,...args]),
    mainDb.execute(`SELECT id,client_id,provider_user_id,clinical_session_id,service_date,service_code FROM billing_encounters WHERE agency_id=? AND service_date BETWEEN ? AND ?${scope('client_id')}`,[agencyId,period.start,period.today,...args]),
    mainDb.execute(`SELECT * FROM client_fiscal_session_history WHERE agency_id=? AND fiscal_start=?${scope('client_id')} ORDER BY id DESC`,[agencyId,period.start,...args]),
    mainDb.execute(`SELECT DISTINCT a.id,p.client_id,a.provider_user_id,a.start_at,a.source_timezone,a.clinical_session_id,a.office_event_id FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id AND p.role IN ('client','student') WHERE a.agency_id=? AND a.status='completed' AND LOWER(a.business_type) IN ('clinical','counseling','therapy','mental_health','behavioral_health') AND a.start_at>=? AND a.start_at<?${scope('p.client_id')}`,[agencyId,queryStart,queryEnd,...args]),
    mainDb.execute(`SELECT client_id,provider_user_id,service_date,service_code,reported_sessions FROM client_session_count_evidence WHERE agency_id=? AND service_date BETWEEN ? AND ?${scope('client_id')}`,[agencyId,period.start,period.today,...args]),
    mainDb.execute(`SELECT client_id,provider_user_id,service_date,service_code,COUNT(*) AS reported_sessions FROM agency_psychotherapy_report_rows WHERE agency_id=? AND client_id IS NOT NULL AND service_date BETWEEN ? AND ?${scope('client_id')} GROUP BY client_id,provider_user_id,service_date,service_code`,[agencyId,period.start,period.today,...args])
  ]);
  for(const [index,kind] of [[0,'clinical_session'],[1,'billing_encounter'],[3,'appointment']]){
    if(results[index].status!=='fulfilled')continue;
    try{results[index].value[0]=await visibleClinicalWork(results[index].value[0],{db:mainDb,kind});}catch(reason){results[index]={status:'rejected',reason};}
  }
  const byClient=new Map((ids||[]).map(id=>[id,{sessions:[],encounters:[],history:[],appointments:[],observations:[]}]));
  for(const [i,key] of ['sessions','encounters','history','appointments','observations','observations'].entries())for(const row of results[i].status==='fulfilled'?results[i].value[0]:[]){const id=Number(row.client_id);if(!byClient.has(id))byClient.set(id,{sessions:[],encounters:[],history:[],appointments:[],observations:[]});byClient.get(id)[key].push(row);}
  return new Map([...byClient].map(([id,data])=>[id,{...summarizeFiscalSessions({...data,baseline:data.history[0]||null,period}),history:data.history.slice(0,10).map(row=>({id:row.id,count:row.session_count,psychotherapyCount:row.psychotherapy_count,throughDate:ymd(row.through_date),reason:row.reason,createdAt:row.created_at,actorUserId:row.actor_user_id})),unavailable:results.some(r=>r.status==='rejected')}]));
}
export async function loadClientFiscalSessions({agencyId,clientId},mainDb=pool,careDb=clinicalPool){return (await loadAgencyFiscalSessions({agencyId,clientIds:[clientId]},mainDb,careDb)).get(Number(clientId));}
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
