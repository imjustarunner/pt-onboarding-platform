import {supervisionHistoryPacket} from './assistantPayrollSupervision.service.js';
import {readPayrollReview,payrollReviewPacket} from './assistantPayrollReview.service.js';
import crypto from 'node:crypto';
import pool from '../config/database.js';
import {assistantDigest,assistantRef,assistantError,parseAssistantJson} from './assistantTeamPolicy.js';
import {readAssistantPayrollSnapshot,parseAssistantPayrollMinutes} from './assistantPayrollFacts.service.js';

const sources={office_support:['client_exchange','client_enrollment','intake','client_onboarding'],school_support:['school_contact','school_onboarding','school_coverage','school_reinit'],billing:['insurance_verification','billing_review','claim_review','family_billing'],people_operations:['provider_update','hiring','onboarding','credential','background_check']};
const ageBucket=(date,now)=>{const n=Math.max(0,(now-new Date(date))/86400000);return n<1?'under_one_day':n<3?'one_to_three_days':n<7?'three_to_seven_days':'over_one_week';};
export function safeOperationalTask(row,role,now=new Date()){
 const state=['pending','in_progress','completed','blocked','overdue'].includes(row.status)?row.status:'pending';
 return {ref:assistantRef(),role,workflowState:state,ageBucket:ageBucket(row.created_at||row.updated_at,now),recommendedAction:state==='blocked'?'request_human_review':'verify_next_handoff',sourceType:'existing_task'};
}
export function safePayrollClaim(row){
 const payload=parseAssistantJson(row.payload_json), minutes=parseAssistantPayrollMinutes(payload.totalMinutes??payload.minutes);
 const flags=[];if(minutes===null)flags.push('MINUTES_REQUIRE_REVIEW');if(!row.suggested_payroll_period_id)flags.push('TARGET_PERIOD_REQUIRES_REVIEW');
 return {ref:assistantRef(),staffRef:assistantRef(),participantRole:'staff',workflowState:['submitted','returned'].includes(row.status)?row.status:'human_review',submittedMinutes:minutes,category:['indirect_time','meeting_training','skill_builder_event'].includes(row.claim_type)?row.claim_type:'other_time',validationFlags:flags,recommendedActions:['request_evidence','possible_duplicate','ready_for_human_review','needs_correction']};
}
export async function listOperationalSources({agencyId,subrole,afterId=0,limit=100,capabilities=[]},db=pool){
 const size=Math.max(1,Math.min(200,Math.trunc(Number(limit)||100)));
 if(subrole==='payroll'){
  const [rows]=await db.execute(`SELECT * FROM (
   SELECT id,user_id,status,claim_type,JSON_OBJECT('totalMinutes',JSON_EXTRACT(payload_json,'$.totalMinutes'),'minutes',JSON_EXTRACT(payload_json,'$.minutes'),'source',JSON_EXTRACT(payload_json,'$.source'),'sessionType',JSON_EXTRACT(payload_json,'$.sessionType')) payload_json,suggested_payroll_period_id,updated_at,'payroll_time_claim' sourceKind,id*3 sourceCursor FROM payroll_time_claims WHERE agency_id=? AND id*3>? AND status IN ('submitted','returned')
   UNION ALL SELECT id,user_id,status,claim_type,NULL payload_json,suggested_payroll_period_id,updated_at,'payroll_school_mileage' sourceKind,id*3+1 sourceCursor FROM payroll_mileage_claims WHERE agency_id=? AND id*3+1>? AND status='submitted' AND claim_type='school_travel'
   ${capabilities.includes('payroll.review_supervision_history')?`UNION ALL SELECT s.id,s.user_id,'pending' status,'supervision_history' claim_type,NULL payload_json,NULL suggested_payroll_period_id,s.updated_at,'payroll_supervision_monitor' sourceKind,s.id*3+2 sourceCursor FROM supervision_accounts s JOIN user_agencies ua ON ua.user_id=s.user_id AND ua.agency_id=s.agency_id AND ua.is_active=1 JOIN users u ON u.id=s.user_id AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 WHERE s.agency_id=${Number(agencyId)} AND s.id*3+2>${Math.max(0,Number(afterId)||0)}`:''}
  ) queue ORDER BY sourceCursor LIMIT ${size}`,[agencyId,afterId,agencyId,afterId]);return rows;

 }
 const kinds=sources[subrole];if(!kinds)return [];
 const [rows]=await db.execute(`SELECT id,status,source_ref_type,source_ref_id,assigned_to_user_id,created_at,updated_at FROM tasks WHERE assigned_to_agency_id=? AND id>? AND status NOT IN ('completed','cancelled') AND (${kinds.map(()=>"source_ref_type LIKE ?").join(' OR ')}) ORDER BY id LIMIT ${size}`,[agencyId,afterId,...kinds.map(x=>`${x}%`)]);
 return rows.map(r=>({...r,sourceKind:'task'}));
}
export async function operationalSourceRevision({agencyId,sourceKind,sourceId},db=pool){
 let rows;
 if(sourceKind==='payroll_time_claim') return (await readAssistantPayrollSnapshot({agencyId,sourceId},db)).sourceRevision;
 else if(sourceKind==='task') [rows]=await db.execute('SELECT id,status,source_ref_type,source_ref_id,assigned_to_user_id,created_at,updated_at FROM tasks WHERE assigned_to_agency_id=? AND id=?',[agencyId,sourceId]);
 else throw assistantError(409,'SOURCE_UNAVAILABLE','The source needs preparation.');
 if(!rows?.length)throw assistantError(409,'SOURCE_UNAVAILABLE','The source is no longer available.');
 return assistantDigest(rows[0]);
}
export async function buildOperationalPacket({agencyId,subrole,row,capabilities=[]},db=pool){
 if(row.sourceKind==='payroll_supervision_monitor')return {...await supervisionHistoryPacket({agencyId,sourceId:row.id},db),taskKind:'payroll.review_supervision_history'};
 const p=parseAssistantJson(row.payload_json);
 if(row.sourceKind==='payroll_school_mileage'||(subrole==='payroll'&&p.source==='supervision_session_finalize'&&p.sessionType==='individual')){const kind=row.sourceKind==='payroll_school_mileage'?'payroll_school_mileage':'payroll_individual_supervision';return payrollReviewPacket(await readPayrollReview({agencyId,kind,sourceId:row.id},db),{includeSupervisionHistory:capabilities.includes('payroll.review_supervision_history')});}

 const facts=subrole==='payroll'?await readAssistantPayrollSnapshot({agencyId,sourceId:row.id},db):null;
 if(facts&&!['submitted','returned'].includes(facts.target.status))return {status:'blocked',reasonCode:'SOURCE_NO_LONGER_PENDING'};
 const claim=facts?{status:facts.target.status,claim_type:facts.target.claimType,payload_json:{totalMinutes:facts.target.minutes},suggested_payroll_period_id:facts.target.suggestedPeriodId}:row;
 const item=subrole==='payroll'?safePayrollClaim(claim):safeOperationalTask(row,subrole);
 if(facts){item.validationFlags=[...new Set([...item.validationFlags,...facts.validation.flags])];item.comparisonCounts=facts.validation.counts;}
 const packet={type:subrole,items:[item],limitations:['Only approved workflow facts are shown. Source narratives and identifying fields remain in the staff workspace.',...(facts?['Duplicate checks cover recognized meeting/kiosk source events only. Overlap checks use valid explicit ISO intervals; local-clock-only, segmented travel, missing or invalid intervals remain unverifiable. No absence of a flag establishes payroll approval.']:[])],allowedRecommendations:subrole==='payroll'?item.recommendedActions:['verify_next_handoff','request_human_review','needs_configuration','source_state_inconsistent']};
 const mapping={sourceKind:row.sourceKind,sourceId:Number(row.id),...(subrole==='payroll'?{userId:Number(facts.target.userId),validationPeerIds:facts.peers.map(peer=>peer.id)}:{}),references:{[item.ref]:{kind:row.sourceKind,id:Number(row.id)},...(item.staffRef?{[item.staffRef]:{kind:'user',id:Number(facts.target.userId)}}:{})}};
 return {packet,mapping,sourceRevision:facts?.sourceRevision||await operationalSourceRevision({agencyId,sourceKind:row.sourceKind,sourceId:row.id},db),status:'ready'};
}
