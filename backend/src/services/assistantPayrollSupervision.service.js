/** Coded staff-only supervision history for the external Payroll Assistant. No notes, names, license numbers or client links. */
import pool from '../config/database.js';
import {assistantDigest,assistantRef,assistantError,parseAssistantJson} from './assistantTeamPolicy.js';
export const SUPERVISION_FREQUENCY_VERSION='michael-individual-frequency-2026-11-02';
export const INDIVIDUAL_TIER_GUIDANCE=Object.freeze({1:{monthlyMinutes:60,payPeriodMinutes:30},2:{monthlyMinutes:120,payPeriodMinutes:60},3:{weeklyMinutes:60}});
const day=v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10);
const num=v=>v==null||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);
const yes=v=>[1,true,'1'].includes(v);
const dateKey=(v,zone='America/Denver')=>{const raw=typeof v==='string'&&!/[zZ]|[+-]\d\d:\d\d$/.test(v)?v.replace(' ','T')+'Z':v;return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(raw));};
const plusDays=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
export function supervisionWindowFacts({sessions,tiers,asOf,individualRequirement=null,recordedIndividualHours=null}){
 const weekday=new Date(asOf+'T12:00:00Z').getUTCDay(),weekStart=plusDays(asOf,-((weekday+6)%7)),monthStart=asOf.slice(0,7)+'-01';
 const sorted=[...tiers].sort((a,b)=>a.periodEnd.localeCompare(b.periodEnd));
 const covering=sorted.filter(t=>t.periodStart<=asOf&&t.periodEnd>=asOf).at(-1);const prior=sorted.filter(t=>t.periodEnd<asOf&&['posted','finalized'].includes(t.status)).at(-1);
 const basis=covering||prior;const tier=basis?.tier??null;
 const individual=sessions.filter(s=>s.sessionType==='individual'&&s.finalized&&s.sessionDay<=asOf);
 const periodMinutes=basis?individual.filter(s=>s.sessionDay>=(covering?.periodStart||asOf)&&s.sessionDay<=(covering?.periodEnd||asOf)).reduce((n,s)=>n+s.minutes,0):null;
 const monthMinutes=individual.filter(s=>s.sessionDay>=monthStart).reduce((n,s)=>n+s.minutes,0),weekMinutes=individual.filter(s=>s.sessionDay>=weekStart).reduce((n,s)=>n+s.minutes,0);
 const guidance=INDIVIDUAL_TIER_GUIDANCE[tier]||null;const flags=[];
 if(!guidance)flags.push('SUPERVISION_TIER_UNAVAILABLE');
 // A prior posted tier is labelled provisional; it does not rewrite the tier of an old pay period.
 if(!covering)flags.push('CURRENT_PERIOD_TIER_PROVISIONAL');
 if(guidance?.payPeriodMinutes!=null&&covering&&periodMinutes>guidance.payPeriodMinutes)flags.push('INDIVIDUAL_PERIOD_FREQUENCY_EXCEEDED');
 if(guidance?.monthlyMinutes!=null&&monthMinutes>guidance.monthlyMinutes)flags.push('INDIVIDUAL_MONTH_GUIDANCE_EXCEEDED');
 if(guidance?.weeklyMinutes!=null&&weekMinutes>guidance.weeklyMinutes)flags.push('INDIVIDUAL_WEEK_FREQUENCY_EXCEEDED');
 const windowTiers=sorted.filter(t=>t.periodEnd>=monthStart&&t.periodStart<=asOf).map(t=>t.tier).filter(t=>t!=null);
 if(new Set(windowTiers).size>1)flags.push('TIER_CHANGED_WITHIN_REVIEW_WINDOW');
 if(individualRequirement!=null&&recordedIndividualHours!=null&&recordedIndividualHours>individualRequirement)flags.push('RECORDED_INDIVIDUAL_REQUIREMENT_EXCEEDED');
 if(individualRequirement!=null&&recordedIndividualHours!=null&&recordedIndividualHours===individualRequirement)flags.push('RECORDED_INDIVIDUAL_REQUIREMENT_REACHED');
 return {asOf,timeZone:'America/Denver',countedSessionType:'individual_only',tier,tierBasis:covering?'saved_current_period':prior?'last_posted_period_provisional':'unavailable',payPeriod:covering?{start:covering.periodStart,end:covering.periodEnd}:null,weekStart,monthStart,payPeriodIndividualMinutes:covering?periodMinutes:null,monthIndividualMinutes:monthMinutes,weekIndividualMinutes:weekMinutes,guidance,flags};
}
export async function readSupervisionHistory({agencyId,userId,now=new Date()},db=pool){
 const [[member]]=await db.execute('SELECT user_id,is_active,supervision_is_prelicensed,supervision_start_date,supervision_start_individual_hours,supervision_start_group_hours FROM user_agencies WHERE user_id=? AND agency_id=?',[userId,agencyId]);
 if(!member||!yes(member.is_active))throw assistantError(403,'SUPERVISION_HISTORY_SCOPE','Supervision history is outside this agency.');
 const [[account]]=await db.execute('SELECT individual_hours,group_hours,updated_at FROM supervision_accounts WHERE agency_id=? AND user_id=?',[agencyId,userId]);
 const [[agency]]=await db.execute('SELECT supervision_enabled,supervision_policy_json FROM agencies WHERE id=?',[agencyId]);
 const policy=parseAssistantJson(agency?.supervision_policy_json);const requirement=yes(agency?.supervision_enabled)&&yes(member.supervision_is_prelicensed)?num(policy.requiredIndividualHours):null;
 const [rawTiers]=await db.execute(`SELECT ps.id,pp.id period_id,pp.period_start,pp.period_end,pp.status,ps.tier_credits_current,ps.tier_credits_final,JSON_EXTRACT(ps.breakdown,'$.__tier.tierLevel') saved_tier,ps.computed_at FROM payroll_summaries ps JOIN payroll_periods pp ON pp.id=ps.payroll_period_id AND pp.agency_id=ps.agency_id WHERE ps.agency_id=? AND ps.user_id=? ORDER BY pp.period_start,ps.id LIMIT 5001`,[agencyId,userId]);
 const [rawSessions]=await db.execute(`SELECT s.id,s.session_type,s.start_at,s.status,s.finalized_at,a.total_seconds,a.is_finalized,a.manual_correction_id,a.source_version,a.updated_at,
  CASE WHEN EXISTS(SELECT 1 FROM supervision_session_attendees required_attendee WHERE required_attendee.session_id=s.id AND required_attendee.user_id=? AND required_attendee.is_required=1) THEN 1 ELSE 0 END mandatory_attendee
  FROM supervision_sessions s JOIN supervision_session_attendance_rollups a ON a.session_id=s.id AND a.user_id=?
  WHERE s.agency_id=? AND (s.supervisee_user_id=? OR (s.session_type='group' AND EXISTS(SELECT 1 FROM supervision_session_attendees x WHERE x.session_id=s.id AND x.user_id=?))) AND s.supervisor_user_id<>?
  ORDER BY s.start_at,s.id LIMIT 5001`,[userId,userId,agencyId,userId,userId,userId]);
 const [imported]=await db.execute('SELECT payroll_period_id,individual_hours,group_hours,updated_at FROM supervision_period_entries WHERE agency_id=? AND user_id=? ORDER BY payroll_period_id LIMIT 5001',[agencyId,userId]);
 if([rawTiers,rawSessions,imported].some(rows=>rows.length>5000))throw assistantError(409,'SUPERVISION_HISTORY_TOO_LARGE','This history needs a larger reviewed page window; no partial history was certified.');
 let tiers=rawTiers.map(t=>({periodStart:day(t.period_start),periodEnd:day(t.period_end),status:t.status,tier:[1,2,3].includes(Number(t.saved_tier))?Number(t.saved_tier):null,tierCredits:num(t.tier_credits_final??t.tier_credits_current)}));
 const sessions=rawSessions.map(s=>({sessionDay:dateKey(s.start_at),sessionType:s.session_type==='individual'?'individual':'group',minutes:Math.round(Number(s.total_seconds||0)/60),finalized:s.status==='FINALIZED'&&yes(s.is_finalized),timeChanged:!!s.manual_correction_id,mandatoryAttendance:yes(s.mandatory_attendee)}));
 tiers=tiers.map(t=>{const minutes=sessions.filter(s=>s.sessionType==='individual'&&s.finalized&&s.sessionDay>=t.periodStart&&s.sessionDay<=t.periodEnd).reduce((n,s)=>n+s.minutes,0);const guidance=INDIVIDUAL_TIER_GUIDANCE[t.tier]||null;return {...t,trackedIndividualMinutes:minutes,guidance,periodFrequencyExceeded:guidance?.payPeriodMinutes!=null?minutes>guidance.payPeriodMinutes:null};});
 const asOf=dateKey(now);const windows=supervisionWindowFacts({sessions,tiers,asOf,individualRequirement:requirement,recordedIndividualHours:num(account?.individual_hours)});
 const facts={asOf,recordedRequirementApplies:yes(member.supervision_is_prelicensed),recordedTotals:{individualHours:num(account?.individual_hours),groupHours:num(account?.group_hours),combinedHours:account?Number(account.individual_hours)+Number(account.group_hours):null,individualRequirementHours:requirement,groupRequirementHours:yes(agency?.supervision_enabled)&&yes(member.supervision_is_prelicensed)?num(policy.requiredGroupHours):null,asOf:account?.updated_at||null},startingBalances:{individualHours:num(member.supervision_start_individual_hours),groupHours:num(member.supervision_start_group_hours)},individualFrequencyPolicy:{version:SUPERVISION_FREQUENCY_VERSION,tiers:INDIVIDUAL_TIER_GUIDANCE,individualOnly:true},windows,sessionHistory:sessions,tierHistory:tiers,importedPeriodHistory:imported.map(r=>({individualHours:num(r.individual_hours),groupHours:num(r.group_hours)})),limitations:['Recorded account totals include the app’s existing credited/imported history. Session rows and starting balances are supporting evidence and must not be added again.','Group attendance is excluded from the tier frequency calculations. Hourly staff are paid for attending the two designated mandatory group sessions; optional group attendance is unpaid.','Historical periods retain their saved tiers. A current-period tier inferred from a prior posted period is provisional. Tier changes and three-pay-period months require review of the applicable window.','Window and pay-period quantities cover finalized tracked individual sessions. Imported balances are shown separately; missing or overlapping imported encounter history requires payroll review.',
 'Frequency and recorded-requirement flags are advisory follow-ups. They do not alter already tracked work or pay and do not certify licensing requirements.']};
 return {facts,sourceRevision:assistantDigest({version:SUPERVISION_FREQUENCY_VERSION,agencyId,userId,asOf,member,account,policy,rawTiers,rawSessions,imported})};
}
export async function supervisionHistoryPacket({agencyId,sourceId},db=pool){
 const [[row]]=await db.execute('SELECT id,user_id FROM supervision_accounts WHERE id=? AND agency_id=?',[sourceId,agencyId]);if(!row)throw assistantError(404,'SUPERVISION_ACCOUNT_UNAVAILABLE','Supervision account unavailable.');
 const review=await readSupervisionHistory({agencyId,userId:row.user_id},db);const [[provider]]=await db.execute('SELECT id,role,credential,title,employment_type,is_hourly_worker,is_active,is_archived FROM users WHERE id=?',[row.user_id]);const ref=assistantRef(),staffRef=assistantRef();
 return {packet:{type:'payroll',version:SUPERVISION_FREQUENCY_VERSION,items:[{ref,staffRef,category:'daily_supervision_history',validationFlags:review.facts.windows.flags}],supervision:review.facts,providerReviewAvailable:true},mapping:{sourceKind:'payroll_supervision_monitor',sourceId:Number(row.id),userId:Number(row.user_id),references:{[ref]:{kind:'supervision_account',id:Number(row.id)},[staffRef]:{kind:'user',id:Number(row.user_id)}}},sourceKind:'payroll_supervision_monitor',sourceRevision:assistantDigest({history:review.sourceRevision,provider}),status:'ready'};
}
