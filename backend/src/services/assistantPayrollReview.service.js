import {readSupervisionHistory} from './assistantPayrollSupervision.service.js';
/** Trusted source facts for an external browser reviewer. Never serializes source rows or free text. */
import pool from '../config/database.js';
import {assistantDigest,assistantError,assistantRef,parseAssistantJson} from './assistantTeamPolicy.js';
import {isStudentIntern} from '../utils/studentIntern.js';
import {computeSubmissionWindow,resolveClaimTimeZone} from '../utils/payrollSubmissionWindow.js';
export const PAYROLL_REVIEW_VERSION='external-payroll-review-v1';
export const PAYROLL_REVIEW_KINDS=Object.freeze({payroll_school_mileage:'payroll.approve_school_mileage',payroll_individual_supervision:'payroll.approve_individual_supervision',payroll_supervision_monitor:'payroll.review_supervision_history'});
const number=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
const json=value=>parseAssistantJson(value,{});
const yes=value=>[true,1,'1','true'].includes(value);
const fail=code=>assistantError(409,code,'This submission needs payroll review. No approval was applied.');
export function payrollProviderBasics(user={},participation='staff'){
 const raw=String(user.credential||'').toUpperCase();
 const credential=['LPCC','LCSW','LMFT','MFTC','LPC','LSW','SWC','QBHA','PSYD','PHD','BA','BS'].find(code=>new RegExp(`\\b${code}\\b`).test(raw))||'not_recorded';
 const role=['provider','provider_plus','clinical_practice_assistant','supervisor','staff','admin','super_admin','support','intern','intern_plus'].includes(user.role)?user.role:'other_staff';
 return {role,credential,employmentType:yes(user.is_hourly_worker)?'hourly':['salaried','salary'].includes(String(user.employment_type).toLowerCase())?'salaried':'not_recorded',participation,studentIntern:isStudentIntern(user)};
}
function localDay(value,zone){if(!value)return null;const raw=typeof value==='string'&&!/[zZ]|[+-]\d\d:\d\d$/.test(value)?value.replace(' ','T')+'Z':value;const dt=new Date(raw);return Number.isFinite(+dt)?new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(dt):null;}
export function schoolAssignmentOnDate(periods,date,weekday,zone){
 return periods.some(p=>yes(p.is_active)&&p.day_of_week===weekday&&localDay(p.valid_from,zone)<date&&(!p.valid_until||localDay(p.valid_until,zone)>date));
}
export function evaluatePayrollReview(s){
 const reasons=[];const c=s.claim,p=json(c.payload_json),provider=payrollProviderBasics(s.provider,s.kind==='payroll_individual_supervision'?(Number(s.session?.supervisor_user_id)===Number(c.user_id)?'supervisor':'supervisee'):'school_provider');
 if(c.status!=='submitted')reasons.push('SUBMISSION_NOT_PENDING');
 if(!yes(s.provider?.is_active)||yes(s.provider?.is_archived)||!yes(s.membership?.is_active))reasons.push('STAFF_MEMBERSHIP_REQUIRES_REVIEW');
 if(!yes(s.agency?.is_active)||yes(s.agency?.is_archived))reasons.push('AGENCY_UNAVAILABLE');
 if(!s.period||s.period.status!=='draft'||s.period.posted_at||s.period.finalized_at||s.period.ran_at||s.period.posted_by_user_id||s.period.finalized_by_user_id)reasons.push('PAY_PERIOD_REQUIRES_REVIEW');
 if(!s.window?.ok||!s.period||day(s.period.period_start)<day(s.window?.eligibleMinPeriod?.period_start))reasons.push('SUBMISSION_WINDOW_REQUIRES_REVIEW');
 if(c.target_payroll_period_id&&Number(c.target_payroll_period_id)!==Number(s.period?.id))reasons.push('PAY_PERIOD_REQUIRES_REVIEW');
 if(s.peers?.length)reasons.push(s.kind==='payroll_school_mileage'?'MULTIPLE_TRIPS_REQUIRE_USER':'DUPLICATE_TIME_REQUIRES_USER');
 if(s.kind==='payroll_school_mileage'){
  if(c.claim_type!=='school_travel'||c.event_travel_report_id)reasons.push('OUTSIDE_SCHOOL_MILEAGE_DUTY');
  if(!s.schoolLinked||!schoolAssignmentOnDate(s.assignments||[],day(c.drive_date),s.weekday,s.timeZone))reasons.push('ASSIGNMENT_ON_REQUESTED_DAY_UNVERIFIED');
  if(c.trip_structure!=='single_school_round_trip')reasons.push(c.trip_structure==='multiple_stops'?'MULTIPLE_STOPS_REQUIRE_USER':'TRIP_STRUCTURE_REQUIRES_USER');
  if(s.hasRouteReviewNote)reasons.push('TRIP_DETAILS_REQUIRE_USER');
  if(![1,2,3].includes(Number(c.tier_level))||!(number(s.mileageRate?.rate_per_mile)>0)||!(number(c.eligible_miles??c.miles)>=0))reasons.push('MILEAGE_RATE_OR_QUANTITY_REQUIRES_REVIEW');
 }else{
  if(c.claim_type!=='indirect_time'||p.source!=='supervision_session_finalize'||p.sessionType!=='individual'||!s.session||Number(s.session.agency_id)!==Number(c.agency_id)||s.session.session_type!=='individual')reasons.push('OUTSIDE_INDIVIDUAL_SUPERVISION_DUTY');
  if(s.session?.status!=='FINALIZED'||!s.session?.finalized_at)reasons.push('TRACKED_SESSION_NOT_FINALIZED');
  const supervisor=provider.participation==='supervisor';
  if(supervisor&&(Number(s.session?.supervisor_time_claim_id)!==Number(c.id)||p.serviceCode!=='99415'))reasons.push('SOURCE_CLAIM_LINK_REQUIRES_REVIEW');
  if(!supervisor&&(Number(s.session?.supervisee_user_id)!==Number(c.user_id)||p.participantRole!=='supervisee'||!yes(p.hourlySupervision)||!yes(s.provider?.is_hourly_worker)))reasons.push('SUPERVISEE_PAY_ELIGIBILITY_REQUIRES_USER');
  if(!supervisor&&provider.credential==='LPCC')reasons.push('LPCC_SUPERVISEE_TIME_NOT_APPROVABLE');
  if(provider.studentIntern)reasons.push('UNPAID_INTERN_ACTIVITY_REQUIRES_USER');
  const minutes=number(p.totalMinutes),seconds=number(s.attendance?.total_seconds),tracked=seconds===null?null:Math.round(seconds/60);
  if(!yes(s.attendance?.is_finalized)||!(seconds>0)||!(minutes>0)||tracked!==minutes)reasons.push('TRACKED_TIME_DOES_NOT_MATCH_SUBMISSION');
  if(minutes>60||seconds>3600)reasons.push('OVER_ONE_HOUR_REQUIRES_USER');
  if((p.bucket&&p.bucket!=='indirect')||s.attendance?.manual_correction_id||p.editedByUserId||p.rateReviewRequired||p.amountExplicit||p.payRateAmountOverride||p.source==='supervision_payroll_correction')reasons.push('TIME_OR_PAY_CHANGE_REQUIRES_USER');
  if(number(p.amount)!==null)reasons.push('MANUAL_AMOUNT_REQUIRES_USER');
  if(!(number(s.amount)>0))reasons.push('ASSIGNED_RATE_REQUIRES_REVIEW');
 }
 return {eligible:reasons.length===0,reasons:[...new Set(reasons)],provider};
}
async function estimateTimeAmount(claim){const {computeDefaultAppliedAmountForTimeClaim}=await import('../controllers/payroll.controller.js');const {default:RateCard}=await import('../models/PayrollRateCard.model.js');return computeDefaultAppliedAmountForTimeClaim({claim:{...claim,payload:json(claim.payload_json)},rateCard:await RateCard.findForUser(claim.agency_id,claim.user_id),approveBucket:'indirect',approveCreditsHours:number(json(claim.payload_json).totalMinutes)/60});}
export async function readPayrollReview({agencyId,kind,sourceId,lock=false},db=pool,{estimate=estimateTimeAmount}={}){
 if(!PAYROLL_REVIEW_KINDS[kind]||!Number.isSafeInteger(Number(sourceId))||Number(sourceId)<=0)throw fail('PAYROLL_SOURCE_UNAVAILABLE');
 const suffix=lock?' FOR UPDATE':'';
 if(kind==='payroll_supervision_monitor'){const[[row]]=await db.execute('SELECT id,user_id FROM supervision_accounts WHERE id=? AND agency_id=?',[sourceId,agencyId]);if(!row)throw fail('SUPERVISION_ACCOUNT_UNAVAILABLE');const review=await readSupervisionHistory({agencyId,userId:row.user_id},db);const[[provider]]=await db.execute('SELECT id,role,credential,title,employment_type,is_hourly_worker,is_active,is_archived FROM users WHERE id=?',[row.user_id]);return {kind,claim:{id:row.id,user_id:row.user_id,agency_id:agencyId},provider,supervisionReview:review,sourceRevision:assistantDigest({history:review.sourceRevision,provider}),evaluation:{provider:payrollProviderBasics(provider,'supervisee')}};}
 const table=kind==='payroll_school_mileage'?'payroll_mileage_claims':'payroll_time_claims';
 const [[claim]]=await db.execute(`SELECT * FROM ${table} WHERE id=? AND agency_id=?${suffix}`,[sourceId,agencyId]);if(!claim)throw fail('PAYROLL_SOURCE_UNAVAILABLE');
 const [[provider]]=await db.execute(`SELECT id,role,credential,title,employment_type,is_hourly_worker,is_active,is_archived FROM users WHERE id=?${suffix}`,[claim.user_id]);
 const [[membership]]=await db.execute(`SELECT user_id,agency_id,is_active FROM user_agencies WHERE user_id=? AND agency_id=?${suffix}`,[claim.user_id,agencyId]);
 const [[agency]]=await db.execute(`SELECT id,is_active,is_archived,new_pay_system_enabled FROM agencies WHERE id=?${suffix}`,[agencyId]);
 const [periods]=await db.execute(`SELECT * FROM payroll_periods WHERE agency_id=? ORDER BY period_start,id${suffix}`,[agencyId]);
 const date=day(claim.drive_date||claim.claim_date),p=json(claim.payload_json);
 const periodReader={findForAgencyByDate:async()=>periods.filter(row=>day(row.period_start)<=date&&day(row.period_end)>=date).at(-1)||null,findNextForAgencyAfter:async({afterDateYmd})=>periods.find(row=>day(row.period_start)>afterDateYmd)||null};
 const s={kind,claim,provider,membership,agency,periods,timeZone:resolveClaimTimeZone(),peers:[]};
 if(kind==='payroll_school_mileage'){
  const [[office]]=await db.execute(`SELECT id,timezone FROM office_locations WHERE id=?${suffix}`,[claim.office_location_id||0]);s.timeZone=resolveClaimTimeZone({officeLocationTimeZone:office?.timezone});
  const [[linked]]=await db.execute(`SELECT id FROM organization_affiliations WHERE agency_id=? AND organization_id=? AND is_active=1${suffix}`,[agencyId,claim.school_organization_id]);
  const [[legacyLinked]]=await db.execute(`SELECT id FROM agency_schools WHERE agency_id=? AND school_organization_id=? AND is_active=1${suffix}`,[agencyId,claim.school_organization_id]);const [[school]]=await db.execute(`SELECT id,organization_type,is_active FROM agencies WHERE id=?${suffix}`,[claim.school_organization_id]);s.school=school;s.schoolLinked=!!(linked||legacyLinked)&&school?.organization_type==='school'&&yes(school.is_active);
  const [assignments]=await db.execute(`SELECT * FROM provider_school_assignment_periods WHERE provider_user_id=? AND school_organization_id=? ORDER BY id${suffix}`,[claim.user_id,claim.school_organization_id]);s.assignments=assignments;
  s.weekday=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  const [peers]=await db.execute(`SELECT id,school_organization_id,status,updated_at FROM payroll_mileage_claims WHERE agency_id=? AND user_id=? AND drive_date=? AND id<>? AND status NOT IN ('rejected','withdrawn') ORDER BY id${suffix}`,[agencyId,claim.user_id,date,claim.id]);s.peers=peers;
  const [[rate]]=await db.execute(`SELECT * FROM agency_mileage_rates WHERE agency_id=? AND tier_level=?${suffix}`,[agencyId,claim.tier_level||0]);s.mileageRate=rate;
  s.hasRouteReviewNote=/multiple|multi[ -]?stop|\b(?:two|three|[2-9])\s+(?:trips|stops|schools)|extra trip/i.test(String(claim.notes||''));
  s.amount=number(claim.eligible_miles??claim.miles)!==null&&number(rate?.rate_per_mile)!==null?Math.round(Number(claim.eligible_miles??claim.miles)*Number(rate.rate_per_mile)*100)/100:null;
 }else{
  const [[session]]=await db.execute(`SELECT id,agency_id,session_type,supervisor_user_id,supervisee_user_id,status,finalized_at,supervisor_time_claim_id,start_at,end_at,event_timezone,updated_at FROM supervision_sessions WHERE id=? AND agency_id=?${suffix}`,[Number(p.supervisionSessionId)||0,agencyId]);s.session=session;
  const [[attendance]]=await db.execute(`SELECT id,session_id,user_id,total_seconds,is_finalized,source_version,manual_correction_id,updated_at FROM supervision_session_attendance_rollups WHERE session_id=? AND user_id=?${suffix}`,[Number(p.supervisionSessionId)||0,claim.user_id]);s.attendance=attendance;
  const [peers]=await db.execute(`SELECT id,status,updated_at FROM payroll_time_claims WHERE agency_id=? AND user_id=? AND id<>? AND status NOT IN ('rejected','withdrawn') AND (CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.supervisionSessionId')) AS UNSIGNED)=? OR (claim_date=? AND claim_type='indirect_time' AND JSON_SEARCH(payload_json,'one','supervision',NULL,'$.allocations[*].serviceTypeKey') IS NOT NULL)) ORDER BY id${suffix}`,[agencyId,claim.user_id,claim.id,Number(p.supervisionSessionId)||0,date]);s.peers=peers;
  // Lock every configuration row used by the existing amount resolver before it reads.
  const configs={};for(const name of ['payroll_rates','payroll_rate_cards','payroll_user_compensation_levels','payroll_user_indirect_service_assignments','payroll_compensation_authorizations']){
   try{const [rows]=await db.execute(`SELECT * FROM ${name} WHERE agency_id=? AND user_id=? ORDER BY ${name==='payroll_rate_cards'?'user_id':'id'}${suffix}`,[agencyId,claim.user_id]);configs[name]=rows;}catch(e){if(e.code!=='ER_NO_SUCH_TABLE')throw e;configs[name]=[];}
  }
  const [agreements]=await db.execute(`SELECT g.id,g.token_values_json,t.metadata,s.signed_pdf_path,s.audit_trail FROM contract_generations g JOIN tasks t ON t.id=g.task_id JOIN signed_documents s ON s.task_id=t.id WHERE g.agency_id=? AND g.candidate_user_id=? ORDER BY g.id${suffix}`,[agencyId,claim.user_id]);configs.agreements=agreements;
  const [matrices]=await db.execute(`SELECT * FROM payroll_pay_system_rates WHERE agency_id=? ORDER BY category,level${suffix}`,[agencyId]);configs.matrices=matrices;
  s.financialSources=configs;try{s.amount=await estimate(claim);}catch{s.amount=null;}
  if(session?.supervisee_user_id){try{s.supervisionReview=await readSupervisionHistory({agencyId,userId:session.supervisee_user_id},db);}catch{s.supervisionReview={facts:{limitations:['SUPERVISEE_HISTORY_UNAVAILABLE']},sourceRevision:null};}}
 }
 s.window=await computeSubmissionWindow({agencyId,effectiveDateYmd:date,submittedAt:claim.created_at,timeZone:s.timeZone,hardStopPolicy:'in_school'},{periodReader});
 s.period=periods.find(row=>Number(row.id)===Number(claim.suggested_payroll_period_id||s.window?.suggestedPayrollPeriodId))||null;
 // All free text stays private. Hash it so a changed instruction/route/claim also invalidates a pending review.
 s.sourceRevision=assistantDigest({version:PAYROLL_REVIEW_VERSION,...s});s.evaluation=evaluatePayrollReview(s);return s;
}
export function payrollReviewPacket(s,{includeSupervisionHistory=false}={}){
 const ref=assistantRef(),staffRef=assistantRef(),schoolRef=assistantRef();const isMileage=s.kind==='payroll_school_mileage';
 return {packet:{type:'payroll',version:PAYROLL_REVIEW_VERSION,providerReviewAvailable:true,...(includeSupervisionHistory&&s.supervisionReview?{supervision:s.supervisionReview.facts}:{}),items:[{ref,staffRef,participantRole:'staff',category:isMileage?'school_mileage':'individual_supervision',workflowState:s.claim.status,
  ...(isMileage?{schoolRef,requestedDay:day(s.claim.drive_date),requestedMiles:number(s.claim.eligible_miles??s.claim.miles),tripStructure:s.claim.trip_structure,assignmentOnRequestedDay:!s.evaluation.reasons.includes('ASSIGNMENT_ON_REQUESTED_DAY_UNVERIFIED'),otherTripCount:s.peers.length}:{submittedMinutes:number(json(s.claim.payload_json).totalMinutes),trackedMinutes:number(s.attendance?.total_seconds)===null?null:Math.round(Number(s.attendance.total_seconds)/60),timeChanged:s.evaluation.reasons.includes('TIME_OR_PAY_CHANGE_REQUIRES_USER'),participation:s.evaluation.provider.participation}),
  validationFlags:s.evaluation.reasons}],approval:{capability:PAYROLL_REVIEW_KINDS[s.kind],eligible:s.evaluation.eligible,amount:s.amount,decision:'external_browser_reviewer_required'},limitations:['Use Who submitted this? to review coded provider information. Names, contacts, addresses, client content and private source files are unavailable.','The bot decides and clicks Approve; the app never approves this queue in the background.']},mapping:{sourceKind:s.kind,sourceId:Number(s.claim.id),userId:Number(s.claim.user_id),references:{[ref]:{kind:s.kind,id:Number(s.claim.id)},[staffRef]:{kind:'user',id:Number(s.claim.user_id)},...(isMileage?{[schoolRef]:{kind:'school',id:Number(s.claim.school_organization_id)}}:{})}},sourceKind:s.kind,sourceRevision:s.sourceRevision,status:'ready'};
}
