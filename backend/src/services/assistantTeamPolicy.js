import crypto from 'node:crypto';

export const ASSISTANT_POLICY_VERSION = 'assistant-teams-v1';
export const ASSISTANT_AGENCIES = Object.freeze([2, 6, 377]);
export const ASSISTANT_OWNER_EMAIL = 'michael@plottwistco.com';
const role = (key,label,description,capabilities,cadence='Weekdays at 07:10 America/Denver') => ({key,label,description,capabilities:capabilities.map(([key,label])=>({key,label})),cadence});
export const ASSISTANT_CATALOG = Object.freeze([
 role('office_support','Office Support Assistant','Review coded intake and referral handoff exceptions.',[['office_support.review','Review readiness exceptions']]),
 role('school_support','School Support Assistant','Review coded school coverage and onboarding exceptions.',[['school_support.review','Review school exceptions']]),
 role('billing','Billing Assistant','Investigate existing billing workflow exceptions without payer or member identifiers.',[['billing.review','Review billing exceptions']]),
 role('payroll','Payroll Assistant','Review submissions and approve only the separately enabled school-mileage and individual-supervision duties.',[['payroll.review','Review coded payroll submissions'],['payroll.approve_school_mileage','Approve reviewed single-school mileage'],['payroll.approve_individual_supervision','Approve unchanged tracked individual supervision'],['payroll.review_supervision_history','Review supervision totals, history and tier frequency'],['payroll.report_to_team','Send the reviewed daily payroll team report']]),
 role('people_operations','People Operations Assistant','Review existing hiring and onboarding handoff exceptions.',[['people_operations.review','Review personnel workflow exceptions']]),
 role('marketing','Marketing Assistant','Analyze aggregate engagement and publish only owner-approved copy variants.',[['marketing.analytics','Review aggregate website engagement'],['marketing.publish','Publish approved general-copy variants']],'Weekdays at 07:10 America/Denver; full analysis on Monday'),
 role('sales','Sales Assistant','Reserved identity. No operational duties.',[],'Disabled'),
 role('clinical','Clinical Assistant','Review screened active plan and latest five eligible signed progress notes; suggestions only.',[['clinical.review','Review screened clinical packets']]),
 role('compliance','Compliance Assistant','Review screened documentation and approved rule packets; findings do not approve claims.',[['compliance.review','Review screened compliance packets']]),
 role('team_lead','AI Assistant Team Lead','Dispatch verified duties and review status without worker packet contents.',[['team_lead.dispatch','Assign due catalog duties'],['team_lead.review','Review team verification and run status']],'Weekdays at 07:00 and 16:00 America/Denver')
]);
export const assistantError=(status,code,message)=>Object.assign(new Error(message),{status,code});
export const parseAssistantJson=(value,fallback={})=>{try{return typeof value==='string'?JSON.parse(value):value??fallback;}catch{return fallback;}};
const canonicalAssistantValue=value=>value instanceof Date?value.toISOString():Array.isArray(value)?value.map(canonicalAssistantValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalAssistantValue(value[key])])):value;
export const assistantDigest=value=>crypto.createHash('sha256').update(JSON.stringify(canonicalAssistantValue(value))).digest('hex');
export const assistantConfigurationHash=a=>assistantDigest({subrole:a.subrole,baa:a.baa_status,privacy:parseAssistantJson(a.privacy_policy_json)});
export const assistantRef=()=>crypto.randomUUID();
export function catalogRole(key){const value=ASSISTANT_CATALOG.find(r=>r.key===key);if(!value)throw assistantError(400,'UNKNOWN_ASSISTANT_SUBROLE','Choose a supported assistant subrole.');return value;}
export function assertAssistantCapabilities(subrole,capabilities){
 if(!Array.isArray(capabilities)||capabilities.some(x=>typeof x!=='string'))throw assistantError(400,'INVALID_CAPABILITIES','Choose capabilities from this role.');
 const allowed=new Set(catalogRole(subrole).capabilities.map(c=>c.key));
 if(capabilities.some(c=>!allowed.has(c)))throw assistantError(403,'CAPABILITY_OUTSIDE_SUBROLE','This capability belongs to another subrole.');
 return [...new Set(capabilities)];
}
export function defaultAssistantSchedule(subrole){return {enabled:false,timezone:'America/Denver',weekdays:[1,2,3,4,5],localTime:subrole==='team_lead'?'07:00':'07:10',...(subrole==='team_lead'?{localTimes:['07:00','16:00']}:{})};}
export function validateAssistantSchedule(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw assistantError(400,'INVALID_SCHEDULE','Enter a schedule.');
 const zone=String(input.timezone||'America/Denver');try{new Intl.DateTimeFormat('en-US',{timeZone:zone}).format();}catch{throw assistantError(400,'INVALID_SCHEDULE','Choose a valid timezone.');}
 const times=Array.isArray(input.localTimes)?input.localTimes:[input.localTime||'07:10'];
 if(!times.length||times.length>12||times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw assistantError(400,'INVALID_SCHEDULE','Use valid local times.');
 const days=input.weekdays??[1,2,3,4,5];if(!Array.isArray(days)||!days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6))throw assistantError(400,'INVALID_SCHEDULE','Choose valid weekdays.');
 return {enabled:input.enabled===true,timezone:zone,weekdays:[...new Set(days)],localTime:times[0],...(times.length>1?{localTimes:[...new Set(times)]}:{})};
}
export function assistantScheduleSlot(schedule,now=new Date()){
 const s=validateAssistantSchedule(schedule);if(!s.enabled)return null;
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:s.timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 const wd=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday);if(!s.weekdays.includes(wd))return null;
 const time=`${p.hour}:${p.minute}`, eligible=(s.localTimes||[s.localTime]).filter(t=>t<=time).sort();if(!eligible.length)return null;
 return `${p.year}-${p.month}-${p.day}/${eligible.at(-1)}/${s.timezone}`;
}
export function assertNarrativeRelease(account){
 const p=parseAssistantJson(account.privacy_policy_json||account.privacyPolicy);
 if(account.baa_status!=='verified'&&account.baaStatus!=='verified')throw assistantError(409,'BAA_NOT_VERIFIED','Narrative release is awaiting BAA verification.');
 if(typeof p.externalService!=='string'||p.externalService.trim().length<2||typeof p.baaReference!=='string'||p.baaReference.trim().length<5||typeof p.sampleReviewReference!=='string'||p.sampleReviewReference.trim().length<5)throw assistantError(409,'BAA_EVIDENCE_REQUIRED','Record the external service, BAA coverage reference and reviewed privacy sample.');
 if(!p.enabled||!p.approved||!p.sampleReviewPassed||!String(p.revision||'').trim())throw assistantError(409,'PRIVACY_RELEASE_NOT_APPROVED','Narrative release policy and sample review are required.');
 return {...p,baaVerified:true};
}
export function publicAssistantAccount(row){return {id:Number(row.id),userId:Number(row.user_id),agencyId:Number(row.agency_id),agencyName:row.agency_name,displayName:row.display_name,email:row.email,subrole:row.subrole,status:row.status,policyRevision:Number(row.policy_revision),capabilities:parseAssistantJson(row.capabilities_json,[]),schedule:parseAssistantJson(row.schedule_json,defaultAssistantSchedule(row.subrole)),baaStatus:row.baa_status,privacyPolicy:parseAssistantJson(row.privacy_policy_json),groupStatus:row.group_status};}
export function safeWorkerIdentity(row){return {displayName:row.display_name,agencyName:row.agency_name,subrole:row.subrole,status:row.status,policyRevision:Number(row.policy_revision),capabilities:parseAssistantJson(row.capabilities_json,[])};}
export function assertAccountCapability(account,capability){if(account.status!=='active'||!parseAssistantJson(account.capabilities_json,[]).includes(capability))throw assistantError(403,'ASSISTANT_CAPABILITY_DISABLED','This duty is not enabled for this account.');assertAssistantCapabilities(account.subrole,[capability]);}
export function normalizeAssistantResult(input,allowedRefs=[]){
 if(!['PASS','FAIL','BLOCKED','NOT_RUN'].includes(input?.outcome)||!Array.isArray(input.findings)||input.findings.length>30)throw assistantError(400,'INVALID_REVIEW_RESULT','Choose a valid outcome and at most 30 findings.');
 const text=(v,max)=>{if(typeof v!=='string'||v.length>max)throw assistantError(400,'INVALID_REVIEW_RESULT','Review text is missing or too long.');return v.trim();};
 const permitted=new Set(allowedRefs);
 const findings=input.findings.map(f=>{if(!['review','warning','blocker','improvement'].includes(f.severity))throw assistantError(400,'INVALID_REVIEW_RESULT','Choose a finding severity.');const refs=f.sourceRefs||[];if(!Array.isArray(refs)||refs.some(r=>!permitted.has(r)))throw assistantError(400,'UNKNOWN_SOURCE_REFERENCE','A finding refers to a source outside this packet.');return {category:text(f.category,80),severity:f.severity,message:text(f.message,2000),sourceRefs:refs,recommendation:text(f.recommendation||'',2000),uncertainty:text(f.uncertainty||'',1000)};});
 const e=input.evidence||{};
 const evidence={browser:text(e.browser||'',100),viewport:text(e.viewport||'',60),buildId:text(e.buildId||'',100),observedAt:text(e.observedAt||'',60),steps:Array.isArray(e.steps)?e.steps.slice(0,50).map(s=>text(s,500)):[]};
 if(!evidence.browser||!evidence.viewport||!evidence.buildId||!evidence.observedAt||!Number.isFinite(Date.parse(evidence.observedAt))||!evidence.steps.length||evidence.steps.some(step=>!step))throw assistantError(400,'REVIEW_EVIDENCE_REQUIRED','Record the browser, viewport, observed build, valid observation time and actual verification steps.');
 return {outcome:input.outcome,findings,evidence};
}

export function assistantStoredConfigurationHash(a){return assistantDigest({userId:Number(a.user_id),agencyId:Number(a.agency_id),subrole:a.subrole,status:a.status,policyRevision:Number(a.policy_revision),capabilities:parseAssistantJson(a.capabilities_json,[]),schedule:parseAssistantJson(a.schedule_json),baa:a.baa_status,privacy:parseAssistantJson(a.privacy_policy_json),groupStatus:a.group_status,groupSnapshot:parseAssistantJson(a.group_snapshot_json,null)});}
