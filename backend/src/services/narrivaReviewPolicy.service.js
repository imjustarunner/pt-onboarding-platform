import crypto from 'node:crypto';

export const NARRIVA_RULES_VERSION='2026-11-06.2';
export const NARRIVA_SCORE_THRESHOLD=70;
export const NARRIVA_QUALITY_CRITERIA=[
 {id:'intervention_specificity',label:'Specific service actions and interventions',points:20,instruction:'Identifies the actual service action or intervention and how it was applied in this encounter; a generic service label alone is insufficient.'},
 {id:'clinical_rationale',label:'Service rationale linked to the documented need',points:15,instruction:'Explains how the documented service action addresses the stated symptom, functional need or service objective, consistent with the exact selected service definition.'},
 {id:'response_specificity',label:'Specific participant response',points:15,instruction:'Describes an actual observed or reported response to the documented service action by the client or attending participant; do not infer normal findings or benefit.'},
 {id:'progress_detail',label:'Evidence of progress or barriers',points:15,instruction:'Supports progress, demonstrated skill or a barrier with a concrete session detail or comparison, rather than only saying progress occurred.'},
 {id:'goal_linkage',label:'Connection to a treatment goal or service objective',points:15,instruction:'Connects the documented session work to a specific existing treatment goal or service-appropriate objective; never invent a goal or score.'},
 {id:'follow_up_specificity',label:'Actionable follow-up',points:15,instruction:'States a specific next action, practice, coordination or follow-up recommendation supported by this encounter, rather than only continue treatment.'},
 {id:'assessment_integration',label:'Assessment findings used in care',points:5,instruction:'When a separate assessment is referenced, documents its actual findings or how the assessment informs this encounter or plan. Do not infer results from a linked file.'}
];
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
const normalizedEvidence=value=>String(value || '').trim();
const completeMandatoryChecks=checks=>Array.isArray(checks)&&checks.length===NARRIVA_CHECKS.length&&NARRIVA_CHECKS.every(([id])=>checks.filter(c=>c.id===id).length===1&&checks.some(c=>c.id===id&&c.status==='passed'&&(!c.findings||c.findings.length===0)));
/** Quality is supplemental: neither points nor a bypass can replace a required check. */
export function deriveNarrivaScoring({qualityEvidence={},assessmentMentioned=null,narrative='',checks=[],reviewStatus=null,qualityBypass=null}={}) {
 const source=normalizedEvidence(narrative);
 const criteria=NARRIVA_QUALITY_CRITERIA.map(criterion=>{
  const applicable=criterion.id!=='assessment_integration'||assessmentMentioned!==false;
  if(!applicable)return {id:criterion.id,label:criterion.label,earned:0,possible:0,status:'not_applicable',evidence:[],message:'No separate assessment is referenced. Excluded from the available points.'};
  const supplied=qualityEvidence?.[criterion.id];
  const evidence=Array.isArray(supplied?.evidence)?[...new Set(supplied.evidence.filter(quote=>typeof quote==='string'&&normalizedEvidence(quote).length>=16&&normalizedEvidence(quote).split(/\s+/).length>=3&&source.includes(normalizedEvidence(quote))).map(normalizedEvidence))].slice(0,3):[];
  const met=supplied?.supported===true&&evidence.length>0&&(criterion.id!=='assessment_integration'||assessmentMentioned===true);
  return {id:criterion.id,label:criterion.label,earned:met?criterion.points:0,possible:criterion.points,status:met?'met':'missing',evidence:met?evidence:[],message:met?'Supported by the saved note evidence.':criterion.instruction};
 });
 const earned=criteria.reduce((sum,c)=>sum+c.earned,0),possible=criteria.reduce((sum,c)=>sum+c.possible,0);
 const score=possible?Math.floor(earned*100/possible):0;
 const mandatoryPassed=completeMandatoryChecks(checks);
 const qualityPassed=possible>0&&earned*100>=NARRIVA_SCORE_THRESHOLD*possible;
 const current=!reviewStatus||['passed','action_required'].includes(reviewStatus);
 return {score,threshold:NARRIVA_SCORE_THRESHOLD,passed:mandatoryPassed&&qualityPassed&&current&&!qualityBypass,
  qualityPassed,mandatoryPassed,earned,possible,criteria,
  missingCriteria:criteria.filter(c=>c.status==='missing').map(c=>c.id),
  findings:qualityPassed?[]:[{id:'scoring:threshold',message:`The note earned ${score}% of applicable quality points; at least ${NARRIVA_SCORE_THRESHOLD}% is required. Review the missing quality criteria using the actual session evidence.`,action:'edit_note',canBypass:true,...(qualityBypass || {})}],
  explanation:`${earned} of ${possible} applicable quality points (${score}%, rounded down). At least ${NARRIVA_SCORE_THRESHOLD}% and all five mandatory checks are required. Not applicable criteria are excluded, with no credit awarded.`,
  disclaimer:'This is a documentation review, not a guarantee of payer approval or reimbursement.'};
}
export function pendingNarrivaScoring() {
 return {...deriveNarrivaScoring(),score:null,explanation:'Quality evidence has not been reviewed. All five mandatory checks and at least 70% are required.',
  findings:[],missingCriteria:[],
  criteria:NARRIVA_QUALITY_CRITERIA.map(c=>({id:c.id,label:c.label,earned:0,possible:c.points,status:'pending',evidence:[],message:c.instruction}))};
}
export function deriveNarrivaCheck(id,{facts,encounter,clinical,service},{standaloneTest=false}={}) {
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
  const serviceAction=service.proBono===true?'clinical_service':'service_code';
  const documentationCode=String(service.documentationCode || service.code || '').trim().toUpperCase();
  required(service.allowed,'qualification',service.reason || 'Review provider qualifications and the enabled service.',serviceAction,false);
  required(service.durationAllowed,'duration','The service and duration do not match an eligible billing rule. Review the service.',serviceAction,false);
  required(service.modalityAllowed!==false,'modality','This delivery method is not allowed for the selected service.',serviceAction,false);
  required(nonempty(encounter.participants),'participants','Select the participants who attended.','participants');
  if(facts.clientPresent===false && encounter.clientPresent===true)add('client_absent','The narrative describes the client as absent. Update participants or confirm your note is correct.','participants');
  if(facts.clientPresent===true && encounter.clientPresent===false)add('client_present','The narrative describes the client attending. Reconcile participants.','participants');
  if(facts.additionalParticipants===true && !encounter.additionalParticipantsDocumented)add('additional','The narrative mentions additional attendees. Reconcile the participant list.','participants');
  if(facts.crisisService===true && ['90837','H0004'].includes(documentationCode)) {
   const suggestion=service.crisisSuggestion;
   const message=service.proBono===true
    ?`Was this an unscheduled crisis service? Reconcile the underlying clinical service${suggestion?` (review ${suggestion})`:''} and document the crisis justification. Keep Pro-Bono Service as the funding and billing disposition.`
    :`Was this an unscheduled crisis service? ${suggestion?`Review ${suggestion} and document the crisis justification.`:'Review the appropriate eligible service and document the crisis justification.'}`;
   add('crisis',message,serviceAction);
  }
  if(facts.serviceDocumentationSupported!==true)add('documentation',service.proBono===true?'Review whether the narrative supports the underlying clinical service and its required documentation. Preserve pro bono funding and billing.':'Review whether the narrative supports the selected service.',serviceAction);
 }
 if(id==='encounter_consent') {
  required(encounter.dateValid,'date','Confirm the service date.','encounter');
  // Only the transient standalone tester evaluates a declared duration without
  // encounter clocks. Saved-note reviews retain the default exact-time check.
  if(standaloneTest)required(Number.isFinite(encounter.durationMinutes) && encounter.durationMinutes>0,'duration','Enter the duration in minutes for this test.','encounter');
  else required(encounter.timesValid,'times','Confirm start/end times and a matching duration.','encounter');
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
 if(findingId==='scoring:threshold') {
  if(review.scoring?.qualityPassed!==false||!['action_required','bypassed'].includes(review.status))throw Object.assign(new Error('This quality finding is not available for bypass.'),{status:409});
  const next=structuredClone(review);
  next.qualityBypass={bypassed:true,bypassReason:reason.trim(),bypassedBy:actorUserId,bypassedAt:new Date().toISOString()};
  next.scoring={...next.scoring,passed:false,findings:next.scoring.findings.map(f=>({...f,...next.qualityBypass}))};
  next.status=narrivaOverall(next.checks)==='passed'?'bypassed':narrivaOverall(next.checks);
  next.quickSignEligible=false;
  return next;
 }
 const next=structuredClone(review),check=next.checks.find(c=>c.findings.some(f=>f.id===findingId));
 const finding=check?.findings.find(f=>f.id===findingId);
 if(!finding || !finding.canBypass || !['action_required','bypassed'].includes(check.status))throw Object.assign(new Error('This finding requires correction before signing.'),{status:409});
 Object.assign(finding,{bypassed:true,bypassReason:reason.trim(),bypassedBy:actorUserId,bypassedAt:new Date().toISOString()});
 check.status=check.findings.every(f=>f.bypassed)?'bypassed':'action_required';
 next.status=narrivaOverall(next.checks);
 if(next.status==='passed' && next.scoring?.qualityPassed===false)next.status=next.qualityBypass?'bypassed':'action_required';
 if(next.scoring)next.scoring.passed=false;
 next.quickSignEligible=false;return next;
}
