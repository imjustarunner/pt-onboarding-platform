import crypto from 'node:crypto';

export const NARRIVA_RULES_VERSION='2026-11-06.1';
export const NARRIVA_CHECKS=[
 ['risk_safety','Risk & Safety'],['service_code','Service Code & Documentation'],
 ['encounter_consent','Encounter Details & Consent'],['necessity_interventions','Clinical Necessity & Interventions'],
 ['participation_plan','Participation, Progress & Plan']
];
export const emptyNarrivaChecks=()=>NARRIVA_CHECKS.map(([id,label])=>({id,label,status:'pending',findings:[],actions:[]}));
export function stableNarrivaJson(value) {
 if(value instanceof Date)return JSON.stringify(value.toISOString());
 if(Array.isArray(value))return `[${value.map(stableNarrivaJson).join(',')}]`;
 if(value && typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableNarrivaJson(value[k])}`).join(',')}}`;
 return JSON.stringify(value ?? null);
}
export const narrivaSourceHash=value=>crypto.createHash('sha256').update(stableNarrivaJson(value)).digest('hex');
const nonempty=value=>typeof value==='string' && value.trim().length>0;
export function deriveNarrivaCheck(id,{facts,encounter,clinical,service}) {
 const result={id,label:NARRIVA_CHECKS.find(c=>c[0]===id)[1],status:'passed',findings:[],actions:[]};
 const add=(key,message,action='edit_note',canBypass=true)=>result.findings.push({id:`${id}:${key}`,message,action,canBypass});
 const required=(condition,key,message,action='edit_note',canBypass=true)=>{if(!condition)add(key,message,action,canBypass);};
 if(id==='risk_safety') {
  result.riskAssessmentRequired=clinical.riskRequiredFromPriorReview===true || facts.currentRisk===true || facts.riskUncertain===true;
  if(result.riskAssessmentRequired) {
   required(clinical.riskAssessmentComplete,'assessment','Complete the risk assessment for the risk identified in this session.','risk_assessment',false);
   if(facts.currentRisk===true && clinical.riskAssessmentDeniesAll===true)add('denial_conflict','Reconcile the identified current risk with the assessment’s blanket denial.','risk_assessment',false);
   if(facts.safetyInterventionsNecessary===true)required(facts.safetyInterventionsDocumented===true,'safety','Document the safety interventions and response.','risk_assessment',false);
  }
 }
 if(id==='service_code') {
  required(service.allowed,'qualification',service.reason || 'Review provider qualifications and the enabled service.','service_code',false);
  required(service.durationAllowed,'duration','The service and duration do not match an eligible billing rule. Review the service.','service_code',false);
  required(service.modalityAllowed!==false,'modality','This delivery method is not allowed for the selected service.','service_code',false);
  required(nonempty(encounter.participants),'participants','Select the participants who attended.','participants');
  if(facts.clientPresent===false && encounter.clientPresent===true)add('client_absent','The narrative describes the client as absent. Update participants or confirm your note is correct.','participants');
  if(facts.clientPresent===true && encounter.clientPresent===false)add('client_present','The narrative describes the client attending. Reconcile participants.','participants');
  if(facts.additionalParticipants===true && !encounter.additionalParticipantsDocumented)add('additional','The narrative mentions additional attendees. Reconcile the participant list.','participants');
  if(facts.crisisService===true && ['90837','H0004'].includes(service.code)) {
   const suggestion=service.crisisSuggestion;
   add('crisis',`Was this an unscheduled crisis service? ${suggestion?`Review ${suggestion} and document the crisis justification.`:'Review the appropriate eligible service and document the crisis justification.'}`,'service_code');
  }
  if(facts.serviceDocumentationSupported!==true)add('documentation','Review whether the narrative supports the selected service.','service_code');
 }
 if(id==='encounter_consent') {
  required(encounter.dateValid,'date','Confirm the service date.','encounter');
  required(encounter.timesValid,'times','Confirm start/end times and a matching duration.','encounter');
  required(nonempty(encounter.location),'location','Select the service location.','encounter');
  required(nonempty(encounter.modality),'method','Select the service delivery method.','encounter');
  required(encounter.consentConfirmed===true,'consent','Confirm the documented consent to participate.','encounter');
 }
 if(id==='necessity_interventions') {
  required(clinical.hasDiagnosis && clinical.hasJustification,'diagnosis','Add the clinical diagnosis and its service justification.','clinical_context');
  required(clinical.hasPresentingProblem,'presenting','Include the current presenting problem/reason for service.','clinical_context');
  required(facts.interventionsDocumented===true,'interventions','Identify the interventions actually performed.');
  required(facts.medicalNecessityDocumented===true,'necessity','Document the symptoms, impairment, and reason continued service is needed.');
  if(facts.assessmentMentioned===true)required(clinical.assessmentEvidencePresent,'assessment','Attach or link the assessment referenced by this note.','assessment');
 }
 if(id==='participation_plan') {
  for(const [key,label] of [['engagementDocumented','engagement'],['responseDocumented','response to interventions'],['progressDocumented','benefit, progress or barriers'],['goalsDocumented','treatment goals'],['followUpDocumented','follow-up plan']])required(facts[key]===true,key,`Document ${label} using the actual session evidence.`);
 }
 result.status=result.findings.length?'action_required':'passed';
 result.actions=[...new Set(result.findings.map(f=>f.action))];return result;
}
export function narrivaOverall(checks) {
 if(checks.some(c=>c.status==='unavailable'))return 'unavailable';
 if(checks.some(c=>['pending','running'].includes(c.status)))return 'running';
 if(checks.some(c=>c.status==='action_required'))return 'action_required';
 return checks.some(c=>c.status==='bypassed')?'bypassed':'passed';
}
export function bypassNarrivaFinding(review,findingId,reason,actorUserId) {
 if(typeof reason!=='string' || reason.trim().length<5 || reason.length>2000)throw Object.assign(new Error('Explain why you are keeping this note (5–2,000 characters).'),{status:400});
 const next=structuredClone(review),check=next.checks.find(c=>c.findings.some(f=>f.id===findingId));
 const finding=check?.findings.find(f=>f.id===findingId);
 if(!finding || !finding.canBypass || !['action_required','bypassed'].includes(check.status))throw Object.assign(new Error('This finding requires correction before signing.'),{status:409});
 Object.assign(finding,{bypassed:true,bypassReason:reason.trim(),bypassedBy:actorUserId,bypassedAt:new Date().toISOString()});
 check.status=check.findings.every(f=>f.bypassed)?'bypassed':'action_required';
 next.status=narrivaOverall(next.checks);next.quickSignEligible=false;return next;
}
