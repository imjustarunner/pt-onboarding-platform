import crypto from 'node:crypto';
import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import {requireNarrivaAgency,narrivaError,positiveId} from './narrivaAccess.service.js';
import {narrivaFeatures,inspectNarrivaFacts} from './narrivaReview.service.js';
import {narrivaLocalContext} from './narrivaSource.service.js';
import {resolveAgencySchedulingCatalog} from './agencySchedulingCatalog.service.js';
import {createSessionPrivacyContext} from './sessionAiPrivacy.service.js';
import {requireNarrivaIdentifierCorrection} from './narrivaInputPrivacy.service.js';
import {NARRIVA_RULES_VERSION,emptyNarrivaChecks,deriveNarrivaCheck,deriveNarrivaScoring,narrivaOverall,narrivaSourceHash} from './narrivaReviewPolicy.service.js';

const contextKeys=['serviceCode','underlyingServiceCode','credentialTier','dateOfService','startTime','endTime','durationMinutes','modality','placeOfService','location','participants','consentConfirmed','diagnosis','diagnosticJustification','presentingProblem','goals','assessmentExcerpt','riskAssessmentCompleted','riskDomains'];
const tiers=['qbha','bachelors','intern_plus'];
const riskStates=['','denied','present','uncertain','historical'];
const text=(v,max=8000)=>typeof v==='string'?v.trim().slice(0,max):'';
const strict=(value,keys)=>{
 if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k)))throw narrivaError(422,'Use only the standalone tester fields. Client, draft, note and session links are not accepted.','NARRIVA_TEST_INPUT_INVALID');
};
async function access(user,agencyId){
 await requireNarrivaAgency(user,agencyId);
 if(!(await narrivaFeatures(agencyId)).compliance)throw narrivaError(403,'Narriva Compliance is disabled in this workspace.');
}
export async function narrivaTestOptions(user,agencyId){
 await access(user,agencyId);
 const codes=await AgencyMedicalServiceCode.listByAgency(agencyId);
 return {services:codes.filter(c=>!c.isAddon && !/ET/i.test(c.serviceCode)).map(c=>({code:c.serviceCode,label:c.description || c.serviceCode,referenceAvailable:['available','supplemental-policy'].includes(c.serviceInfo?.status)})),rulesVersion:NARRIVA_RULES_VERSION};
}

// No chart reader, review persistence, report run, billing call or signing token.
// The only record context is the authorized agency's existing rules/guidance.
export async function runNarrivaTestReview(user,body){
 strict(body,['agencyId','noteText','sessionNarrative','context']);
 const agencyId=positiveId(body.agencyId);await access(user,agencyId);
 const c=body.context;strict(c,contextKeys);
 for(const [key,value] of Object.entries(c))if(!['riskDomains','consentConfirmed','riskAssessmentCompleted','durationMinutes'].includes(key)&&(typeof value!=='string'||value.length>(['diagnosticJustification','presentingProblem','goals','assessmentExcerpt'].includes(key)?8000:200)))throw narrivaError(422,'A test field is invalid or exceeds its length limit.');
 if(c.durationMinutes!==undefined&&c.durationMinutes!==null&&(!Number.isInteger(Number(c.durationMinutes))||Number(c.durationMinutes)<0||Number(c.durationMinutes)>1440))throw narrivaError(422,'Enter a test duration of up to 1,440 minutes.');
 if(typeof body.noteText!=='string'||!body.noteText.trim()||body.noteText.length>150000||typeof body.sessionNarrative==='string'&&body.sessionNarrative.length>150000)throw narrivaError(422,'Paste note content of up to 150,000 characters.','NARRIVA_TEST_INPUT_INVALID');
 if(!tiers.includes(c.credentialTier))throw narrivaError(422,'Choose the provider qualification for this test.');
 const serviceCode=text(c.serviceCode,40).toUpperCase(),codes=await AgencyMedicalServiceCode.listByAgency(agencyId);
 const serviceRule=codes.find(r=>r.serviceCode===serviceCode && !r.isAddon && !/ET/i.test(serviceCode));
 if(!serviceRule)throw narrivaError(422,'Choose an enabled base service for this workspace.');
 if(c.riskDomains!==undefined){strict(c.riskDomains,['suicidalIdeation','homicidalIdeation','selfHarm']);if(Object.values(c.riskDomains).some(v=>!riskStates.includes(v)))throw narrivaError(422,'Choose the recorded risk findings for this test.');}
 for(const key of ['consentConfirmed','riskAssessmentCompleted'])if(c[key]!==undefined&&c[key]!==null&&typeof c[key]!=='boolean')throw narrivaError(422,'Test consent and assessment confirmations must be explicit choices.');
 const narrative=body.noteText.trim(),input=text(body.sessionNarrative,150000);
 const clinicalText=[narrative,input,...['diagnosis','diagnosticJustification','presentingProblem','goals','assessmentExcerpt'].map(k=>text(c[k]))].join('\n\n');
 requireNarrivaIdentifierCorrection(clinicalText);
 // Fail before model dispatch if the approved inspector detects identifiers or
 // cannot run. Test content is neither logged nor stored in application tables.
 const privacy=createSessionPrivacyContext();
 if(await privacy.redact(clinicalText)!==clinicalText)throw narrivaError(422,'Possible identifying information was found. Remove names, initials, birth dates, addresses and other identifiers before testing.','PHI_INPUT_REQUIRES_CORRECTION');
 const riskKeys={suicidalIdeation:'Suicidal Ideation',homicidalIdeation:'Homicidal Ideation',selfHarm:'Self-Harm'};
 const riskAssessment={items:Object.fromEntries(Object.entries(riskKeys).map(([key,label])=>[label,{option:c.riskDomains?.[key] || ''}]))};
 riskAssessment.patientDeniesAll=Object.keys(riskKeys).every(k=>c.riskDomains?.[k]==='denied');
 const meta={serviceCode,underlyingServiceCode:text(c.underlyingServiceCode,40).toUpperCase(),sessionContext:{startTimeLocal:text(c.startTime,8),endTimeLocal:text(c.endTime,8),durationMinutes:Number(c.durationMinutes)||0,modality:['in_person','video','phone'].includes(c.modality)?c.modality:'',placeOfService:['02','10','11','03','12','99'].includes(c.placeOfService)?c.placeOfService:'',locationLabel:['Office','School','Home','Community','Other'].includes(c.location)?c.location:'',participants:['Client only','Client and guardian','Guardian without client','Client and others'].includes(c.participants)?c.participants:''},
  structuredChart:{diagnoses:text(c.diagnosis)?[{code:text(c.diagnosis,200)}]:[],diagnosticJustification:text(c.diagnosticJustification),presentingProblem:text(c.presentingProblem),riskAssessment},
  narrivaContext:{consentConfirmed:c.consentConfirmed===true,modality:['in_person','video','phone'].includes(c.modality)?c.modality:'',presentingProblem:text(c.presentingProblem),clientPresent:c.participants==='Guardian without client'?false:['Client only','Client and guardian','Client and others'].includes(c.participants)?true:null,riskAssessmentCompleted:c.riskAssessmentCompleted===true}};
 const row={user_id:user.id,service_code:serviceCode,date_of_service:text(c.dateOfService,10)};
 const local=narrivaLocalContext({source:row,meta,provider:{role:'provider',credential:{qbha:'QBHA',bachelors:'BA',intern_plus:'LPC'}[c.credentialTier]},serviceRule,documentationServiceRule:codes.find(r=>r.serviceCode===meta.underlyingServiceCode)});
 if(!meta.sessionContext.participants)local.encounter.clientPresent=null;
 try{local.encounter.dateValid=/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_service)&&new Date(`${row.date_of_service}T12:00:00Z`).toISOString().slice(0,10)===row.date_of_service;}catch{local.encounter.dateValid=false;}
 const catalog=await resolveAgencySchedulingCatalog({agencyId,credentialTier:c.credentialTier,allServiceCodes:[],eligibleServiceCodes:[]});
 const allowed=new Set(catalog.eligibleServiceCodes.map(r=>r.code));
 local.service.allowed=local.service.allowed&&allowed.has(local.service.documentationCode || serviceCode);
 if(local.service.crisisSuggestion&&!allowed.has(local.service.crisisSuggestion))local.service.crisisSuggestion=null;
 local.clinical.assessmentEvidencePresent=!!text(c.assessmentExcerpt);
 const source={agencyId,userId:user.id,source:row,meta,provider:{},client:{},identifiers:[],narrative,inputText:[input,text(c.goals)?`Test treatment goals: ${text(c.goals)}`:'',text(c.assessmentExcerpt)?`Test assessment evidence: ${text(c.assessmentExcerpt)}`:''].filter(Boolean).join('\n\n'),...local};
 const {facts,qualityEvidence,guidanceHash,serviceReferenceHash,model}=await inspectNarrivaFacts(source);
 const checks=emptyNarrivaChecks().map(check=>{const result=deriveNarrivaCheck(check.id,{...source,facts});return {...result,findings:result.findings.map(f=>({...f,canBypass:false}))};});
 let status=narrivaOverall(checks);
 const scoring=deriveNarrivaScoring({qualityEvidence,assessmentMentioned:facts.assessmentMentioned,narrative,checks,reviewStatus:status});
 scoring.findings=scoring.findings.map(f=>({...f,canBypass:false}));
 if(status==='passed'&&!scoring.qualityPassed)status='action_required';
 return {id:`test-${crypto.randomUUID()}`,testOnly:true,status,checks,scoring,riskAssessmentRequired:checks[0].riskAssessmentRequired===true,quickSignEligible:false,signingActions:[],rulesVersion:NARRIVA_RULES_VERSION,guidanceHash,serviceReferenceHash,model,sourceHash:narrivaSourceHash({narrative,context:c}),completedAt:new Date().toISOString(),limitations:'Results use your declared test facts. No chart records, real consent documents, linked assessment files, signature, billing or treatment history were verified.'};
}
