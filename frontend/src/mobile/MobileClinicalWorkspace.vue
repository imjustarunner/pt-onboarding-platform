<script setup>
import InternalDiagnosticCriteriaReview from '../components/clinical/InternalDiagnosticCriteriaReview.vue';
import NarrivaClinicalAssist from '../components/clinical/NarrivaClinicalAssist.vue';
import ExternalClinicalDiagnosis from '../components/clinical/ExternalClinicalDiagnosis.vue';
import NoteAidStructuredChartPanel from '../components/clinical/NoteAidStructuredChartPanel.vue';
import { isMentalStatusExamComplete, isRiskAssessmentComplete, buildAllNormalMse, buildAllNotAssessedMse, emptyRiskAssessment } from '../utils/noteAidMseCatalog.js';
import NarrivaReviewWorkspace from '../components/clinical/NarrivaReviewWorkspace.vue';
import { resolveNoteAidBillingCodes } from '../utils/noteAidBillingAddons.js';
import NarrivaSessionConfirmations from '../components/clinical/NarrivaSessionConfirmations.vue';
import { planObjectiveReview, formatObjectiveRatings, objectiveReviewMessage, objectiveDispositions } from '../utils/narrivaObjectiveReview.js';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import NarrivaModeChooser from '../components/clinical/NarrivaModeChooser.vue';
import ClinicalLocationPicker from '../components/clinical/ClinicalLocationPicker.vue';
import NarrivaCompliancePanel from '../components/clinical/NarrivaCompliancePanel.vue';
import NarrivaInlineFinding from '../components/clinical/NarrivaInlineFinding.vue';
import { mergeSessionDiagnosis, sessionDiagnosisEntryMode, canSelectSessionDiagnosis } from '../utils/narrivaClinicalContext.js';
import NarrivaAssessmentEvidence from '../components/clinical/NarrivaAssessmentEvidence.vue';
import { activateClinicalRecovery,canRetainClinicalRecovery,stashClinicalRecovery,findClinicalRecovery,discardClinicalRecovery,clinicalRecoveryFingerprint } from './clinicalRecovery.js';
import ServiceInformation from '../components/notes/ServiceInformation.vue';
import { isProBonoFundingCode, underlyingClinicalServiceOptions } from '../utils/clinicalServiceReference.js';
import { NARRIVA_BRAND } from '../config/narrivaBrand.js';
import { aidKind, aidAllowsInteractiveComplexity, aidSkipsMentalStatusExam, aidDiagnosisMode, findNoteAidByToolOrCode } from '../config/noteAidWorkspace.js';
import { createEmptyCsNoteBuildState, serializeCsNoteBuildForGenerate, CS_DEFAULT_INTERVENTIONS } from '../utils/csNoteBuild.js';
import { useNarrivaReview } from '../composables/useNarrivaReview.js';
import { synchronizeServiceTimes } from '../utils/clinicalServiceTimes.js';
import SessionSupportingMaterials from '../components/clinical/SessionSupportingMaterials.vue';
import ConfidentialClinicalEntries from '../components/clinical/ConfidentialClinicalEntries.vue';
import ClinicalDiagnosisSearch from '../components/clinical/ClinicalDiagnosisSearch.vue';
import ClinicalDiagnosisFields from '../components/clinical/ClinicalDiagnosisFields.vue';
import {intakeSectionsForRecord} from '../utils/noteAidIntakeIntegration.js';
import {clinicalClientPresent,clinicalServiceRequirements} from '../utils/clinicalEncounterRequirements.js';
import {encounterConsentStatement,progressContextSections} from '../utils/narrivaProgressContext.js';
import {participantChoice,encounterMethod,currentGenerationReceipt} from './noteWorkflow.js';
import { mobileClinicalClient } from './clinicalTransport.js';
import { backInMobile } from './mobileNavigation.js';
import MobileNoteSignatures from './MobileNoteSignatures.vue';
import {clinicalTimestamp,clinicalClock,clinicalNarrativeDisplay} from './clinicalDisplay.js';

const props=defineProps({apiBase:String,sessionToken:String,userId:[Number,String]});
const emit=defineEmits(['signed','finished']);
const route=useRoute(),router=useRouter(),context=ref(null),loading=ref(false),saving=ref(false),generating=ref(false),signing=ref(false),error=ref(''),notice=ref('');
const api=computed(()=>mobileClinicalClient(props.apiBase,props.sessionToken));
const selection=computed(()=>Object.fromEntries(['workId','clinicalSessionId','officeEventId','clientId','draftId','noteId','recordingId'].filter(key=>route.query[key]).map(key=>[key,route.query[key]])));
const agencyId=computed(()=>context.value?.agencyId),draftId=ref(null),mode=ref('manual'),defaultMode=ref('manual'),preferenceSaving=ref(false),preferenceError=ref('');
const sessionPresentingProblemOverride=ref(null);
const assessmentContext=ref(null),assessmentKind=ref('initial'),assessmentKindConfirmed=ref(false),diagnosesConfirmed=ref(false);let assessmentRequest=0;
const assessmentEvidence=ref([]),showAssessmentEvidence=ref(false),underlyingServiceCode=ref('');
const underlyingCode=computed(()=>isProBonoFundingCode(encounter.serviceCode)?underlyingServiceCode.value:'');
const underlyingOptions=computed(()=>underlyingClinicalServiceOptions(context.value?.serviceCodes || []));
const narrative=ref(''),output=ref({sections:{Narrative:''},meta:{}}),smart=ref(createEmptyCsNoteBuildState()),smartStep=ref(0),ratings=reactive({});
const riskDomains=['Suicidal Ideation','Homicidal Ideation','Self-Harm'],riskChoices=reactive({'Suicidal Ideation':'','Homicidal Ideation':'','Self-Harm':''});
const assessmentChart=computed(()=>output.value.meta?.structuredChart || {});
function updateAssessment(field,value){
  output.value.meta.structuredChart={...assessmentChart.value,[field]:value};
  if(field==='riskAssessment')riskCompleted.value=false;
}
const riskDomainComplete=computed(()=>mode.value!=='smart_notes' ? isRiskAssessmentComplete(assessmentChart.value.riskAssessment) : riskDomains.every(key=>!!riskChoices[key]));
const encounterAid=computed(()=>findNoteAidByToolOrCode({toolId:output.value?.meta?.toolId,serviceCode:underlyingCode.value || encounter.serviceCode})?.aid);
const clientPresent=computed(()=>clinicalClientPresent({sessionContext:encounter}));
const mseRequired=computed(()=>clientPresent.value!==false && mode.value!=='smart_notes' && !aidSkipsMentalStatusExam(findNoteAidByToolOrCode({serviceCode:underlyingCode.value || encounter.serviceCode})?.aid,underlyingCode.value || encounter.serviceCode));
const assessmentPending=computed(()=>assessmentContext.value?.requiresDiagnosisConfirmation && !diagnosesConfirmed.value || mseRequired.value && !isMentalStatusExamComplete(assessmentChart.value.mentalStatusExam) || clientPresent.value!==false && (riskIncluded.value || requiredRisk.value) && (!riskCompleted.value || !riskDomainComplete.value));
const mseHistory=ref([]);
const encounter=reactive({dateOfService:'',startTimeLocal:'',endTimeLocal:'',durationMinutes:'',serviceCode:'',participants:'',locationLabel:'',serviceLocationId:'',billingOfficeLocationId:'',placeOfService:'',modality:'',participantsDetail:'',clientLocationDescription:'',consentConfirmed:false,interactiveComplexitySelected:false});
const locationChoices=computed(()=>context.value?.locationChoices || []);
const riskIncluded=ref(false),riskCompleted=ref(false),riskText=ref(''),riskRequiredLatched=ref(false),accurate=ref(false),necessary=ref(false),dirty=ref(false);
const {review,busy:reviewBusy,error:reviewError,runReview,observeReview,resolveFinding,invalidate}=useNarrivaReview({agencyId,apiClient:{get:(...args)=>api.value.get(...args),post:(...args)=>api.value.post(...args),patch:(...args)=>api.value.patch(...args)}});
let pendingAuthorSignature=null;
let savedRatingBatch=null;
let generation=0,hydrating=false,saveTimer=null,savePromise=null,revision=0,disposed=false,completionTimer=null;
const readOnly=computed(()=>context.value?.note?.readOnly===true);
const manualBlocked=computed(()=>mode.value==='manual' && context.value?.preferences?.features?.manualAllowed===false);
const recoveryCopy=ref(null),recoveryNeedsSave=ref(false),recoveryWarning=ref(''),serviceReason=ref(''),serviceSaving=ref(false),pendingConfirmation=ref(null),servicePendingOther=ref(false),serviceVerificationError=ref('');let serverRecoveryFingerprint='',recoveryActorUserId=0;
const serviceChanged=computed(()=>!!pendingConfirmation.value || servicePendingOther.value || !!encounter.serviceCode && String(encounter.serviceCode)!==String(context.value?.session?.serviceCode || ''));
const canCosign=computed(()=>context.value?.review?.canCosign===true),cosignAttested=ref(false);
const savedSignature=ref(null);
const displayTimeZone=computed(()=>context.value?.session?.sourceTimezone || context.value?.note?.serviceTimeZone || 'America/Denver');
const signatureDate=value=>clinicalTimestamp(value,displayTimeZone.value);
const displayedSignatures=computed(()=>{
 const rows=[...(context.value?.note?.signatures || [])],saved=savedSignature.value;
 const signature=saved?.kind==='cosign'?saved.supervisorCosign:saved?.providerSignature;
 if(signature){const actorUserId=signature.actorUserId || signature.cosignedByUserId;const row={...signature,actorUserId,role:saved.kind==='cosign'?'supervisor':'provider',signedAt:signature.signedAt || signature.cosignedAt || saved.cosignedAt || saved.signedAt};if(row.signerLabel && row.signedAt && !rows.some(item=>item.role===row.role && item.actorUserId===actorUserId))rows.push(row);}
 return rows;
});
const encounterSummary=computed(()=>[
 ['Date of service',encounter.dateOfService],['Service',service.value?.label || service.value?.name?`${encounter.serviceCode} · ${service.value.label || service.value.name}`:encounter.serviceCode],
 ['Time',[encounter.startTimeLocal,encounter.endTimeLocal].filter(Boolean).map(clinicalClock).join('–')],['Time zone',displayTimeZone.value],['Duration',encounter.durationMinutes?`${encounter.durationMinutes} minutes`:''],
 ['Participants',encounter.participants],['Location',encounter.locationLabel],['Method',encounter.modality==='in_person'?'In person':encounter.modality==='telehealth'?'Telehealth':encounter.modality]
]);
const originalConsent=computed(()=>context.value?.note?.consentEvidence || (encounter.consentConfirmed?{confirmed:true,label:'Participation consent recorded by the author'}:{confirmed:false,label:'Participation consent not recorded in this note'}));
function completedSignature(data,kind,openNext=false){
 const receipt={...data,agencyId:agencyId.value,draftId:draftId.value,kind,openNext};savedSignature.value=receipt;emit('signed',receipt);
 clearTimeout(completionTimer);completionTimer=setTimeout(()=>{if(!disposed)emit('finished',receipt);},1800);
}
const sections=computed(()=>{
  const stored=output.value?.sections || {};
  if(readOnly.value || mode.value!=='narriva' || !output.value.meta?.generationReceipt)return stored;
  const confirmed=output.value.meta?.narrivaPreflight?.clinicalContext || {};
  const contextSections=progressContextSections({...confirmed,
    presentingProblem:confirmed.presentingProblem || presentingProblem.value,
    diagnoses:confirmed.diagnoses?.length?confirmed.diagnoses:clinicalDiagnoses.value,
    diagnosticJustification:confirmed.diagnosticJustification || diagnosticJustification.value});
  return {...contextSections,...stored};
});
const hasContent=computed(()=>Object.values(sections.value).some(text=>String(text || '').trim()));
const reviewAnchor = ref(null), objectivePanel = ref(null), preparingReview = ref(false);
const receiptMatches=ref(false);
const generatedCurrent=computed(()=>receiptMatches.value && (!Array.isArray(output.value.meta?.generatedObjectiveRatings) || ratingDecisionKey(currentRatings())===ratingDecisionKey(output.value.meta.generatedObjectiveRatings)));
function ratingDecisionKey(rows){
  return JSON.stringify(rows.filter(row=>!row.raterKind || row.raterKind==='clinician').map(row=>[Number(row.objectiveId),row.scaleValue==null?null:Number(row.scaleValue),row.disposition || 'rated']).sort((a,b)=>a[0]-b[0]));
}
const reviewStarted=ref(false),reviewPhase=ref('output'),preflightSource=ref('');
const clinicalDiagnoses=computed(()=>output.value.meta?.structuredChart?.diagnoses ?? context.value?.clinicalContext?.diagnoses ?? context.value?.treatmentPlan?.diagnoses ?? []);
const clinicalContextDiagnosisMode=computed(()=>{
 const code=underlyingCode.value || encounter.serviceCode,aid=findNoteAidByToolOrCode({serviceCode:code})?.aid || {serviceCode:code};
 return sessionDiagnosisEntryMode(aidDiagnosisMode(aid,{credentialTier:context.value?.credentialTier}),context.value?.credentialTier);
});
const diagnosticJustification=computed(()=>output.value.meta?.structuredChart?.diagnosticJustification ?? context.value?.clinicalContext?.diagnosticJustification ?? context.value?.treatmentPlan?.diagnosticJustification ?? '');
const presentingProblem=computed(()=>sessionPresentingProblemOverride.value ?? output.value.meta?.narrivaContext?.presentingProblem ?? context.value?.clinicalContext?.presentingProblem ?? context.value?.treatmentPlan?.presentingProblem ?? '');
const manualDxQuery=ref('');
const diagnosisAllowed = row => canSelectSessionDiagnosis(clinicalContextDiagnosisMode.value,row);
function selectManualDiagnosis(row) {
  if (!diagnosisAllowed(row) || clinicalDiagnoses.value.some(d => (d.icd10_code || d.code) === row.code)) return;
  updateAssessment('diagnoses',[...clinicalDiagnoses.value,{icd10_code:row.code,description:row.description,justification:'',is_primary:clinicalDiagnoses.value.length ? 0 : 1}]);
  manualDxQuery.value='';
}
const enrollmentLoading=ref(false);
async function loadEnrollment(){
  if(enrollmentLoading.value || !context.value?.client?.id)return;
  const active=generation;
  enrollmentLoading.value=true;
  try {
    const {data}=await api.value.get('/clients/'+context.value.client.id+'/enrollment-sections');
    if(active!==generation || mode.value!=='manual')return;
    const intake=aidKind(encounterAid.value)==='intake';
    let added=0;
    for(const [key,text] of Object.entries(data.sections || {})){
      if(!intake && key!=='Presenting Problem')continue;
      const previous=output.value.sections[key] || '';
      if(!text || previous.includes(text))continue;
      output.value.sections[key]=[previous,text].filter(Boolean).join('\n\n');added++;
    }
    notice.value=added?'Enrollment information added for review.':'No additional enrollment information matched this note.';
  } catch(e){if(active===generation)error.value='Enrollment information could not be loaded.';}
  finally {enrollmentLoading.value=false;}
}
const searchClinicalDiagnosis=(payload,options)=>api.value.post('/diagnosis-search',payload,options);
const preGenerationRequired=computed(()=>mode.value==='narriva' && !!context.value?.session?.id);
const preflightFingerprint=()=>clinicalRecoveryFingerprint({agencyId:agencyId.value,clientId:context.value?.client?.id,sessionId:context.value?.session?.id,draftId:draftId.value,inputText:generationInput(),clinicalContext:{diagnoses:clinicalDiagnoses.value,diagnosticJustification:diagnosticJustification.value,presentingProblem:presentingProblem.value},encounter:{...encounter},ratings:currentRatings(),underlyingServiceCode:underlyingCode.value,assessmentEvidence:assessmentEvidence.value,riskIncluded:riskIncluded.value,riskCompleted:riskCompleted.value,riskText:riskText.value,riskChoices:{...riskChoices}});
const draftApproval=ref(null);
const draftApproved=computed(()=>!!draftApproval.value?.token && draftApproval.value.token===review.value?.draftApprovalToken);
const preflightReady=computed(()=>preGenerationRequired.value && review.value?.phase==='pre_generation' && ['passed','bypassed'].includes(review.value?.status) && preflightSource.value===preflightFingerprint());
const inlineContext=computed(()=>({agencyId:agencyId.value,credentialTier:context.value?.credentialTier,diagnosisMode:clinicalContextDiagnosisMode.value,diagnoses:clinicalDiagnoses.value,diagnosticJustification:diagnosticJustification.value,presentingProblem:presentingProblem.value,consentConfirmed:encounter.consentConfirmed,participants:encounter.participants,participantsDetail:encounter.participantsDetail,dateOfService:encounter.dateOfService,startTime:encounter.startTimeLocal,endTime:encounter.endTimeLocal,durationMinutes:encounter.durationMinutes,location:{...encounter},clientLocationDescription:encounter.clientLocationDescription}));
const prepared=computed(()=>readOnly.value || mode.value==='manual' || generatedCurrent.value);
const showOutput=computed(()=>readOnly.value || mode.value==='manual' || hasContent.value && !!output.value.meta?.generationReceipt);
const reviewComplete=computed(()=>prepared.value && review.value?.phase!=='pre_generation' && reviewStarted.value && !reviewBusy.value && ['passed','bypassed'].includes(review.value?.status) && typeof review.value?.scoring?.score==='number' && review.value.scoring.threshold===70 && review.value.checks?.length===5 && review.value.checks.every(check=>['passed','bypassed'].includes(check.status)));
function generationInput(){return mode.value==='smart_notes'?serializeCsNoteBuildForGenerate({...smart.value,startTime:encounter.startTimeLocal,endTime:encounter.endTimeLocal,participantsMode:encounter.participants},{serviceCode:encounter.serviceCode,locationLabel:encounter.locationLabel,skipMse:true}):narrative.value;}
let receiptCheck=0;
async function refreshGeneration(){const check=++receiptCheck;receiptMatches.value=false;const matches=await currentGenerationReceipt(output.value.meta?.generationReceipt,generationInput(),encounter.serviceCode,mode.value);if(check===receiptCheck)receiptMatches.value=matches;}
const service=computed(()=>context.value?.serviceCodes?.find(item=>(item.code || item.serviceCode)===encounter.serviceCode));
const requiredRisk=computed(()=>clientPresent.value!==false && (riskRequiredLatched.value || review.value?.riskAssessmentRequired===true));
const recordingText=computed(()=>typeof context.value?.recordingNarrative==='string'?context.value.recordingNarrative:context.value?.recordingNarrative?.narrative || context.value?.recordingNarrative?.text || '');
const allowComplexity=computed(()=>aidAllowsInteractiveComplexity(findNoteAidByToolOrCode({serviceCode:underlyingCode.value || encounter.serviceCode})?.aid)
  && resolveNoteAidBillingCodes({primaryCode:encounter.serviceCode,durationMinutes:encounter.durationMinutes,includeInteractiveComplexity:true,metadata:output.value.meta}).allow90785);
const selectedComplexity=computed(()=>allowComplexity.value && encounter.interactiveComplexitySelected===true);
const goals=computed(()=>clinicalServiceRequirements({serviceCode:encounter.serviceCode,assessmentKind:assessmentKind.value}).requireExistingGoals?context.value?.treatmentPlan?.goals || []:[]);
const ratingSectionTitle='Treatment objective ratings';
const savedRatingsText=computed(()=>{
  if(sections.value[ratingSectionTitle])return sections.value[ratingSectionTitle];
  if(mode.value!=='narriva' || !showOutput.value || readOnly.value)return '';
  return formatObjectiveRatings(planObjectiveReview(goals.value,output.value.meta?.objectiveRatings).objectives);
});
const hasRatingSummary=computed(()=>Boolean(savedRatingsText.value && mode.value==='narriva' && !readOnly.value));
const displayedSections=computed(()=>hasRatingSummary.value
  ? Object.fromEntries(Object.entries(sections.value).filter(([key])=>key!==ratingSectionTitle)) : sections.value);
const showProviderSign=computed(()=>!readOnly.value && hasContent.value && prepared.value && (mode.value==='manual' ? !manualBlocked.value && encounter.consentConfirmed && !assessmentPending.value : mode.value==='narriva' || reviewComplete.value));
const notePanel=ref(null);
const editingNoteSection=ref('');
const blockingAlerts=computed(()=>(context.value?.alerts || []).filter(item=>item.blocking));
const selectionKey=()=>JSON.stringify(selection.value);

function currentRatings(){return Object.entries(ratings).filter(([,value])=>value!=='' && value!=null).map(([objectiveId,value])=>({objectiveId:Number(objectiveId),scaleValue:Object.hasOwn(objectiveDispositions,value)?null:Number(value),disposition:Object.hasOwn(objectiveDispositions,value)?value:'rated',raterKind:'clinician'}));}
function metadata(){return {...(output.value.meta || {}),writerMode:mode.value,includeInteractiveComplexity:selectedComplexity.value,underlyingServiceCode:underlyingCode.value || null,smartNotes:smart.value,sessionContext:{...encounter,sourceTimezone:context.value?.session?.sourceTimezone},narrivaContext:{...(output.value.meta?.narrivaContext || {}),assessmentKind:assessmentKind.value,assessmentKindConfirmed:assessmentKindConfirmed.value,diagnosesConfirmed:diagnosesConfirmed.value,writerMode:mode.value,underlyingServiceCode:underlyingCode.value || null,assessmentEvidence:assessmentEvidence.value,consentConfirmed:encounter.consentConfirmed,modality:encounter.modality,participantsDetail:encounter.participantsDetail,clientLocationDescription:encounter.clientLocationDescription,presentingProblem:presentingProblem.value,presentingProblemOverride:sessionPresentingProblemOverride.value,interactiveComplexitySelected:selectedComplexity.value,riskAssessmentIncluded:riskIncluded.value,riskAssessmentRequired:requiredRisk.value,riskAssessmentCompleted:riskCompleted.value},structuredChart:{...(output.value.meta?.structuredChart || {}),diagnoses:output.value.meta?.structuredChart?.diagnoses ?? context.value?.clinicalContext?.diagnoses ?? context.value?.treatmentPlan?.diagnoses ?? [],diagnosticJustification:output.value.meta?.structuredChart?.diagnosticJustification ?? context.value?.clinicalContext?.diagnosticJustification ?? context.value?.treatmentPlan?.diagnosticJustification ?? '',riskAssessment:mode.value!=='smart_notes' ? (assessmentChart.value.riskAssessment || emptyRiskAssessment()) : {...(output.value.meta?.structuredChart?.riskAssessment || {}),patientDeniesAll:false,items:Object.fromEntries(riskDomains.map(key=>[key,{status:riskChoices[key]?'selected':'',option:riskChoices[key]}])),notes:riskText.value}},objectiveRatings:[...(output.value.meta?.objectiveRatings || []).filter(row=>row.raterKind && row.raterKind!=='clinician'),...currentRatings()]};}
function draftPayload(){return {agencyId:agencyId.value,clientId:context.value?.client?.id,clinicalSessionId:context.value?.session?.id || null,officeEventId:context.value?.session?.officeEventId || null,dateOfService:encounter.dateOfService,serviceCode:encounter.serviceCode,writerMode:mode.value,inputText:mode.value!=='manual'?generationInput():narrative.value || Object.entries(sections.value).map(([title,text])=>`${title}: ${text}`).join('\n'),outputJson:{...output.value,sections:{...sections.value,...(mode.value==='manual' && encounter.consentConfirmed ? {'Consent for services':encounterConsentStatement(encounter)} : {}),...(hasRatingSummary.value?{[ratingSectionTitle]:savedRatingsText.value}:{})},meta:metadata()}};}
function markDirty(){if(hydrating || disposed || readOnly.value)return;pendingAuthorSignature=null;dirty.value=true;revision++;accurate.value=false;necessary.value=false;preflightSource.value='';invalidate({preserve:review.value?.phase==='pre_generation'});if(recoveryActorUserId && !canRetainClinicalRecovery(recoveryIdentity(),recoverySnapshot()))recoveryWarning.value='This draft cannot be kept for app-lock recovery because the memory buffer is full or the text is too large. Save it before leaving or locking the app.';else recoveryWarning.value='';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{void save();},600);}
async function save(explicit=false){
  if(recoveryNeedsSave.value && explicit!==true){stashRecovery();return false;}
  if(serviceVerificationError.value){error.value=serviceVerificationError.value;stashRecovery();return false;}
  if(serviceChanged.value){error.value='Confirm the service-code change below before saving or generating.';stashRecovery();return false;}
  if(manualBlocked.value)return false;
  clearTimeout(saveTimer);if(savePromise){await savePromise;if(dirty.value)return save(explicit);return !!draftId.value;}
  if(!dirty.value && !draftId.value && context.value && !readOnly.value && (narrative.value.trim() || hasContent.value)){dirty.value=true;revision++;}
  if(!dirty.value || !context.value || readOnly.value)return !!draftId.value;
  if(!narrative.value.trim() && !hasContent.value && !draftId.value){dirty.value=false;return true;}
  const version=revision,key=selectionKey(),payload=JSON.parse(JSON.stringify(draftPayload())),target=draftId.value;
  saving.value=true;error.value='';
  savePromise=(async()=>{try{const {data}=target?await api.value.patch(`/drafts/${target}`,payload):await api.value.post('/drafts',payload);if(disposed || key!==selectionKey())return false;const id=data?.draft?.id || data?.draftId || data?.id || target;if(!id)throw new Error('Draft not confirmed');draftId.value=id;const sessionId=data.draft?.clinicalSessionId || data.draft?.clinical_session_id;if(sessionId && context.value)context.value={...context.value,session:{...(context.value.session || {}),id:Number(sessionId)}};if(version===revision){dirty.value=false;recoveryNeedsSave.value=false;recoveryWarning.value='';discardClinicalRecovery(recoveryIdentity());}notice.value='Draft saved';return true;}catch(e){if(!disposed && key===selectionKey())error.value=e.response?.data?.error?.message || 'Your draft could not be saved. Keep this page open and retry.';return false;}finally{saving.value=false;savePromise=null;}})();
  return savePromise;
}
async function load(){
  const current=++generation;pendingAuthorSignature=null;savedRatingBatch=null;editingNoteSection.value='';clearTimeout(completionTimer);savedSignature.value=null;hydrating=true;loading.value=true;error.value='';notice.value='';context.value=null;sessionPresentingProblemOverride.value=null;reviewStarted.value=false;reviewPhase.value='output';preflightSource.value='';receiptMatches.value=false;invalidate();clearTimeout(saveTimer);dirty.value=false;
  try{const {data}=await api.value.get('/context',{params:selection.value});if(current!==generation)return;context.value=data;const saved=data.draft?.outputJson || data.note?.outputJson || {sections:{Narrative:''},meta:{}};output.value=typeof saved==='string'?JSON.parse(saved):saved;output.value.sections ||= {Narrative:''};output.value.meta ||= {};
    sessionPresentingProblemOverride.value=typeof output.value.meta.narrivaContext?.presentingProblemOverride==='string'?output.value.meta.narrivaContext.presentingProblemOverride:null;
    draftId.value=data.draft?.id || null;defaultMode.value=data.preferences?.defaultMode || 'manual';mode.value=output.value.meta.writerMode || output.value.meta.narrivaContext?.writerMode || (data.draft || data.note?(output.value.meta.manualSections?'manual':'narriva'):defaultMode.value);if(!data.draft && !data.note && mode.value==='manual' && data.preferences?.features?.manualAllowed===false)mode.value='narriva';
    const session={...(data.session || {}),...(output.value.meta.sessionContext || {})},narriva=output.value.meta.narrivaContext || {};
    assessmentKind.value=narriva.assessmentKind || 'initial';assessmentKindConfirmed.value=narriva.assessmentKindConfirmed===true;diagnosesConfirmed.value=narriva.diagnosesConfirmed===true;
    for(const key of Object.keys(encounter))encounter[key]=key==='interactiveComplexitySelected'?narriva.interactiveComplexitySelected===true || output.value.meta?.includeInteractiveComplexity===true:key==='consentConfirmed'?narriva.consentConfirmed===true:(session[key] ?? '');encounter.modality=encounterMethod(narriva.modality || session.modality,encounter);encounter.participants=participantChoice(encounter.participants,encounter.serviceCode);encounter.participantsDetail=narriva.participantsDetail || encounter.participantsDetail;encounter.clientLocationDescription=narriva.clientLocationDescription || encounter.clientLocationDescription;
    narrative.value=data.draft?.inputText || '';if(!narrative.value.trim() && recordingText.value)narrative.value=recordingText.value;
    smart.value=output.value.meta.smartNotes || createEmptyCsNoteBuildState();smart.value.startTime ||= encounter.startTimeLocal;smart.value.endTime ||= encounter.endTimeLocal;
    underlyingServiceCode.value=output.value.meta.underlyingServiceCode || narriva.underlyingServiceCode || '';assessmentEvidence.value=narriva.assessmentEvidence || [];showAssessmentEvidence.value=false;
    riskRequiredLatched.value=data.riskAssessmentRequired===true || narriva.riskAssessmentRequired===true;riskIncluded.value=narriva.riskAssessmentIncluded===true;riskCompleted.value=narriva.riskAssessmentCompleted===true;riskText.value=output.value.meta.structuredChart?.riskAssessment?.notes || '';for(const key of riskDomains)riskChoices[key]=output.value.meta.structuredChart?.riskAssessment?.items?.[key]?.option || '';
    if(output.value.meta.structuredChart?.riskAssessment?.patientDeniesAll===true)for(const key of riskDomains)riskChoices[key]='Denied';
    for(const key of Object.keys(ratings))delete ratings[key];for(const row of output.value.meta.objectiveRatings || [])if(!row.raterKind || row.raterKind==='clinician')ratings[row.objectiveId]=row.scaleValue ?? row.disposition;
    accurate.value=false;necessary.value=false;cosignAttested.value=false;recoveryNeedsSave.value=false;serviceReason.value='';pendingConfirmation.value=null;servicePendingOther.value=false;serviceVerificationError.value='';if(data.session?.id && data.note?.readOnly!==true)await refreshServiceStatus();await nextTick();
    recoveryActorUserId=Number(props.userId)||0;activateClinicalRecovery(recoveryActorUserId,data.agencyId);serverRecoveryFingerprint=clinicalRecoveryFingerprint(recoverySnapshot());recoveryCopy.value=findClinicalRecovery(recoveryIdentity(),recoverySnapshot());
    await refreshGeneration();
    if(data.reviewUnavailable)notice.value='Your draft is open. The saved compliance result could not be loaded.';
    const savedReview=data.review?.narriva;
    if(savedReview?.checks){
      reviewPhase.value=savedReview.phase || 'output';
      reviewStarted.value=true;
      if(savedReview.phase==='pre_generation')preflightSource.value=preflightFingerprint();
      void observeReview(savedReview);
    }

  }catch(e){if(current===generation)error.value=e.response?.data?.error?.message || 'This note is unavailable for your account.';}finally{if(current===generation){hydrating=false;loading.value=false;}}
}
async function setDefault(value){preferenceSaving.value=true;preferenceError.value='';try{const {data}=await api.value.patch('/narriva/preferences',{agencyId:agencyId.value,defaultMode:value});defaultMode.value=data.defaultMode || data.preferences?.defaultMode || value;}catch{preferenceError.value='Your default could not be saved. The current note is preserved.';}finally{preferenceSaving.value=false;}}
async function checks({phase=preGenerationRequired.value && !generatedCurrent.value?'pre_generation':'output'}={}){
 if(encounter.serviceCode==='H0031' && assessmentKind.value!==(assessmentContext.value?.automaticKind || 'initial') && !assessmentKindConfirmed.value){error.value='Confirm the selected assessment type before submitting.';return;}
  if(readOnly.value || preparingReview.value || reviewBusy.value || (phase==='pre_generation' ? !generationInput().trim() : !hasContent.value || !prepared.value))return;
  if (phase==='pre_generation' && context.value?.requiresObjectiveRatings!==false && planObjectiveReview(goals.value,currentRatings()).missing.length) {
    error.value=objectiveReviewMessage;
    const plan=objectivePanel.value;
    if(plan){plan.open=true;plan.scrollIntoView?.({block:'center'});}
    return;
  }
  error.value='';
  reviewStarted.value=true;reviewPhase.value=phase;
  if(context.value?.preferences?.features?.compliance===false){reviewError.value='Narriva checks are not enabled for this workspace.';return;}
  preparingReview.value=true;
  const requestGeneration=generation;
  try {
  await nextTick();
  if(!signing.value)reviewAnchor.value?.scrollIntoView?.({block:'start'});
  if(!await save(true) || requestGeneration!==generation){
    if(requestGeneration===generation)reviewError.value=error.value || 'Save the session draft before checking.';
    return;
  }
  try{if(phase==='pre_generation')await saveRatings();}catch(e){reviewError.value=e.response?.data?.error?.message || 'The objective scores could not be saved. Retry before checking the narrative.';return;}
  if(requestGeneration!==generation)return;
  const current=generation,fingerprint=preflightFingerprint();
  const result=await runReview({draftId:Number(draftId.value),phase});
  if(current===generation && fingerprint===preflightFingerprint() && result?.phase==='pre_generation')preflightSource.value=fingerprint;
  } finally { preparingReview.value=false; }
}
function editEncounterTime(field, value) {
  const times = { startTime: encounter.startTimeLocal, endTime: encounter.endTimeLocal, durationMinutes: encounter.durationMinutes };
  const next = synchronizeServiceTimes({ ...times, [field]: value }, field);
  Object.assign(encounter, { startTimeLocal: next.startTime, endTimeLocal: next.endTime, durationMinutes: next.durationMinutes });
}
async function applyClinicalAssist(patch){try{if(patch.diagnosis){const {data}=await api.value.post(`/sessions/${context.value.session.id}/diagnoses`,{agencyId:agencyId.value,clientId:context.value.client.id,icd10Code:patch.diagnosis.code || patch.diagnosis.icd10_code,description:patch.diagnosis.description,justification:patch.diagnosis.justification});patch.diagnosis={...patch.diagnosis,id:data.id};}await applyInlineUpdate(patch);}catch(e){error.value=e.response?.data?.error?.message || 'The recommendation could not be applied.';}}
function recordOutsideDiagnosis(diagnosis){output.value.meta.structuredChart={...assessmentChart.value,diagnoses:mergeSessionDiagnosis(clinicalDiagnoses.value,diagnosis)};diagnosesConfirmed.value=false;markDirty();}
async function applyInlineUpdate(patch){
  if(typeof patch.presentingProblem==='string' && patch.presentingProblem.trim())sessionPresentingProblemOverride.value=patch.presentingProblem.trim();
  if(patch.diagnosis && canSelectSessionDiagnosis(clinicalContextDiagnosisMode.value,patch.diagnosis)){
    const diagnoses=mergeSessionDiagnosis(clinicalDiagnoses.value,patch.diagnosis);
    if(diagnoses!==clinicalDiagnoses.value)output.value={...output.value,meta:{...output.value.meta,structuredChart:{...(output.value.meta.structuredChart || {}),diagnoses,diagnosticJustification:patch.diagnosis.justification.trim()}}};
  }
  if('consentConfirmed' in patch)encounter.consentConfirmed=patch.consentConfirmed;
  if('participants' in patch){encounter.participants=patch.participants;encounter.participantsDetail=patch.participantsDetail || '';}
  if(patch.dateOfService)encounter.dateOfService=patch.dateOfService;
  if(patch.startTime)encounter.startTimeLocal=patch.startTime;
  if(patch.endTime)encounter.endTimeLocal=patch.endTime;
  if(patch.durationMinutes)encounter.durationMinutes=patch.durationMinutes;
  if(patch.location)Object.assign(encounter,patch.location);
  if('clientLocationDescription' in patch)encounter.clientLocationDescription=patch.clientLocationDescription;
  if('interactiveComplexitySelected' in patch)encounter.interactiveComplexitySelected=patch.interactiveComplexitySelected;
  if(patch.riskAssessmentIncluded)riskIncluded.value=true;

  if(patch.clarification)narrative.value=[narrative.value.trim(),'Clinician-confirmed clarification: '+patch.clarification].filter(Boolean).join('\n\n');
}

async function saveRatings(){
  const rows=currentRatings(), client=api.value, batchSize=4;
  const scope={agencyId:agencyId.value,clientId:context.value.client.id,clinicalSessionId:context.value.session?.id,draftId:Number(draftId.value)||null,dateOfService:encounter.dateOfService};
  const batch=JSON.stringify([scope,ratingDecisionKey(rows)]);
  if(batch===savedRatingBatch)return;
  savedRatingBatch=null;
  const owner=generation;
  for(let offset=0;offset<rows.length;offset+=batchSize){
    const writes=await Promise.allSettled(rows.slice(offset,offset+batchSize).map(({objectiveId,scaleValue,disposition,raterKind})=>
      client.post(`/objectives/${objectiveId}/ratings`,{...scope,scaleValue,disposition,raterKind})));
    const failed=writes.find(result=>result.status==='rejected');
    if(failed)throw failed.reason;
  }
  if(owner===generation)savedRatingBatch=batch;
}
async function generate(){
 if(assessmentContext.value && encounter.serviceCode==='H0031' && assessmentKind.value!==assessmentContext.value.automaticKind && !assessmentKindConfirmed.value){error.value='Confirm the assessment type before continuing.';return;}
  if(generating.value || readOnly.value || blockingAlerts.value.length)return;
  if(preGenerationRequired.value && !preflightReady.value){error.value='Submit the current session narrative for compliance check and confirm the prompts before generating.';return;}
  const preflightReviewId=preGenerationRequired.value?review.value.id:null;
  if(preflightReviewId && !draftApproved.value){error.value='Review and approve each draft section before finalizing.';return;}
  if(serviceVerificationError.value){error.value=serviceVerificationError.value;return;}
  if(context.value?.preferences?.features?.writing===false){error.value='Narriva writing is not enabled for this workspace.';return;}
  const input=generationInput();
  if(!input.trim()){error.value='Add the session content before generating.';return;}
  generating.value=true;error.value='';const current=generation;
  try{if(!await save(true))return;if(!preflightReviewId)await saveRatings();const requestRevision=revision;const {data}=await api.value.post('/generate',{...draftPayload(),durationMinutes:encounter.durationMinutes,includeInteractiveComplexity:selectedComplexity.value,draftId:Number(draftId.value),...(preflightReviewId?{preflightReviewId,draftApproval:draftApproval.value}:{}),inputText:input,underlyingServiceCode:underlyingCode.value || undefined,aidId:output.value.meta?.aidId,toolId:mode.value==='smart_notes'?'clinical_cs_note_build':/^custom_\d+$/.test(String(output.value.meta?.aidId || ''))?output.value.meta?.toolId:undefined,...(preflightReviewId ? {} : {treatmentPlanContext:context.value.treatmentPlan?.presentingProblem || '',objectiveRatingsContext:JSON.stringify(currentRatings())})});if(current!==generation)return;if(requestRevision!==revision){dirty.value=true;await save();error.value='Your Session Narrative changed while generating. Your current text is preserved; generate again when ready.';return;}if(!data.outputJson?.sections)throw new Error('Generation was not completed');const preserved=metadata();output.value={...data.outputJson,meta:{...preserved,...(data.outputJson.meta || {}),writerMode:mode.value,narrivaContext:preserved.narrivaContext,structuredChart:preserved.structuredChart}};draftId.value=data.draftId || draftId.value;await nextTick();markDirty();await refreshGeneration();if(await save(true)){reviewStarted.value=true;reviewPhase.value='output';void runReview({draftId:Number(draftId.value),phase:'output'});await nextTick();notePanel.value?.scrollIntoView?.({block:'start'});}}catch(e){if(current===generation)error.value=e.response?.data?.error?.message || 'Narriva could not generate the note. Your source text is preserved.';}finally{if(current===generation)generating.value=false;}
}
async function sign(){
  if(assessmentPending.value)return;
  if (mode.value==='manual' && aidKind(encounterAid.value)==='intake' && clinicalDiagnoses.value.some(d => !String(d.justification || '').trim())) {
    error.value='Enter a clinical justification for each intake diagnosis before signing.';return;
  }
  if(mode.value==='manual' && (!encounter.consentConfirmed || String(encounter.placeOfService)==='02' && !encounter.clientLocationDescription.trim())){
    error.value='Confirm consent and the telehealth location in Session details before signing.';return;
  }
  if(!showProviderSign.value || reviewBusy.value || signing.value || !accurate.value || !necessary.value || readOnly.value || !hasContent.value || !context.value?.session?.id)return;
  signing.value=true;error.value='';const current=generation;
  try{
    if(mode.value!=='manual' && !pendingAuthorSignature && !reviewComplete.value){
      if(review.value?.phase==='output' && review.value.status==='action_required'){
        error.value='Resolve the highlighted findings before signing.';
        reviewAnchor.value?.scrollIntoView?.({block:'start'});
        return;
      }
      await checks({phase:'output'});
      if(current!==generation)return;
      if(!reviewComplete.value){
        error.value=reviewError.value || 'Review the findings below before signing.';
        reviewAnchor.value?.scrollIntoView?.({block:'start'});
        return;
      }
    }
    if(!accurate.value || !necessary.value || assessmentPending.value || !await save(true))return;
    await saveRatings();
    if(current!==generation || !accurate.value || !necessary.value)return;
    const signatureRevision=revision;
    const {outputJson}=draftPayload();
    const intake=aidKind(encounterAid.value)==='intake';
    const chart={...outputJson.meta.structuredChart,diagnoses:outputJson.meta.structuredChart.diagnoses.map(dx=>({...dx}))};
    outputJson.meta.structuredChart=chart;
    const recordSections=mode.value==='manual' && intake
      ? intakeSectionsForRecord(outputJson.sections,{...chart,skipMse:!mseRequired.value})
      : outputJson.sections;
    if (!pendingAuthorSignature && mode.value==='manual' && intake && ['full','zr_only'].includes(clinicalContextDiagnosisMode.value)) {
      const existing=context.value.clinicalContext?.diagnoses || context.value.treatmentPlan?.diagnoses || [];
      for (const dx of chart.diagnoses) {
        const code=dx.icd10_code || dx.code;
        const previous=existing.find(row=>(row.icd10_code || row.code)===code);
        if (!diagnosisAllowed(dx) || !dx.justification || previous?.justification===dx.justification) continue;
        const {data}=await api.value.post('/sessions/'+context.value.session.id+'/diagnoses',{
          agencyId:agencyId.value,clientId:context.value.client.id,clinicalSessionId:context.value.session.id,
          icd10Code:code,description:dx.description,justification:dx.justification,isPrimary:!!Number(dx.is_primary)
        });
        if(current!==generation || signatureRevision!==revision)return;
        if(!data?.id)throw Error('The chart could not confirm the saved diagnosis. Your draft is preserved.');
        dx.id=data.id;
      }
    }
    let note=pendingAuthorSignature?.note;
    if(!note){
      const {data}=await api.value.post(`/sessions/${context.value.session.id}/notes`,{
        title:`Clinical note ${encounter.dateOfService}`,noteType:aidKind(encounterAid.value)==='intake'?'INTAKE':'PROGRESS_NOTE',serviceCode:encounter.serviceCode,
        notePayload:JSON.stringify({sections:recordSections}),
        primaryDiagnosisId:(chart.diagnoses.find(dx=>Number(dx.is_primary)===1) || chart.diagnoses[0])?.id || null,
        diagnosticJustification:outputJson.meta.structuredChart.diagnosticJustification || null,
        metadata:{...outputJson.meta,dateOfService:encounter.dateOfService,serviceCode:encounter.serviceCode,
          draftId:Number(draftId.value),generatedBy:'clinical_note_generator',manualSections:mode.value==='manual',
          aiGenerated:mode.value!=='manual',attestation:{accurateAndComplete:true,medicallyNecessary:true,aiContentReviewed:mode.value!=='manual'}}
      });
      if(current!==generation)return;
      note=data.note || data;
      if(!note.id)throw new Error('Saved note was not confirmed');
      if(signatureRevision!==revision)return;
      pendingAuthorSignature={note,reviewId:null};
    }
    const sameReview=pendingAuthorSignature.reviewId && review.value?.id===pendingAuthorSignature.reviewId;
    const result=mode.value==='manual' ? null : sameReview && ['passed','bypassed','action_required'].includes(review.value.status)
      ? review.value : await runReview({noteId:Number(note.id)});
    if(pendingAuthorSignature?.note.id===note.id && result?.id)pendingAuthorSignature.reviewId=result.id;
    if(current!==generation)return;
    if(result?.riskAssessmentRequired && (!riskCompleted.value || !riskDomainComplete.value)){
      riskIncluded.value=true;
      error.value='The note is saved. Complete the required risk assessment before signing.';
      return;
    }
    if(mode.value!=='manual' && (!result || !['passed','bypassed'].includes(result.status))){
      error.value=reviewError.value || 'The chart note is saved. Review the findings before signing.';
      reviewAnchor.value?.scrollIntoView?.({block:'start'});
      return;
    }
    let signingToken=note.signingToken;
    if(!signingToken){
      const saved=await api.value.get(`/notes/${note.id}`);
      signingToken=saved.data.note?.signingToken || saved.data.signingToken;
    }
    if(current!==generation)return;
    if(signatureRevision!==revision || !accurate.value || !necessary.value){
      error.value='The note changed while saving. Review the updated note before signing.';
      return;
    }
    const signed=await api.value.post(`/notes/${note.id}/sign`,{
      agencyId:agencyId.value,signingToken,accurateAndComplete:true,medicalNecessityAttested:true,contentReviewConfirmed:true
    });
    if(current!==generation)return;
    if(!signed.data.signedAt)throw new Error('Signature was not confirmed');
    notice.value='Note signed and saved to the chart.';
    dirty.value=false;
    pendingAuthorSignature=null;
    discardClinicalRecovery(recoveryIdentity());
    context.value={...context.value,note:{...note,readOnly:true}};
    output.value.sections=outputJson.sections;
    completedSignature({...signed.data,noteId:Number(note.id)},'author');
  }catch(e){
    if(current===generation)error.value=e.response?.data?.error?.message || e.message || 'The note was preserved, but signing was not completed.';
  }finally{if(current===generation)signing.value=false;}
}
async function cosign(quick=false,openNext=false){
  if(signing.value || !canCosign.value || !cosignAttested.value || quick && (review.value?.status!=='passed' || review.value?.quickSignEligible!==true))return;
  const current=generation,source=context.value.review;signing.value=true;error.value='';
  try{const {data}=await api.value.post(`/notes/${context.value.note.id}/cosign`,{agencyId:agencyId.value,contentHash:source.contentHash,reviewSnapshotToken:source.reviewSnapshotToken,...(source.entryManifestHash?{expectedEntryManifestHash:source.entryManifestHash}:{}),reviewedAndApproved:true,...(quick?{quickSign:true,narrivaReviewId:review.value.id}:{})});if(current!==generation)return;if(!data.cosignedAt)throw new Error('Signature was not confirmed');notice.value='Supervisor signature saved.';context.value={...context.value,note:{...context.value.note,supervisorCosign:data.supervisorCosign || {cosignedAt:data.cosignedAt}},review:{...context.value.review,canCosign:false}};cosignAttested.value=false;completedSignature({...data,noteId:context.value.note.id},'cosign',openNext);}catch(e){if(current===generation){error.value=e.response?.data?.error?.message || 'The supervisor signature was not completed. Reopen the current note and review it again.';cosignAttested.value=false;invalidate();}}finally{if(current===generation)signing.value=false;}
}
function recoveryIdentity(){return {userId:recoveryActorUserId,agencyId:agencyId.value,clientId:context.value?.client?.id,clinicalSessionId:context.value?.session?.id,officeEventId:context.value?.session?.officeEventId,draftId:draftId.value};}
function recoverySnapshot(){const meta=output.value.meta || {};return {narrative:narrative.value,output:{sections:{...sections.value},meta:{aidId:meta.aidId || null,toolId:meta.toolId || null,model:meta.model || null,generationReceipt:meta.generationReceipt || null,manualSections:mode.value==='manual',writerMode:mode.value,structuredChart:{diagnoses:clinicalDiagnoses.value,diagnosticJustification:diagnosticJustification.value,mentalStatusExam:assessmentChart.value.mentalStatusExam,riskAssessment:assessmentChart.value.riskAssessment},narrivaContext:{presentingProblem:presentingProblem.value,presentingProblemOverride:sessionPresentingProblemOverride.value}}},smart:smart.value,encounter:{...encounter},ratings:{...ratings},mode:mode.value,riskIncluded:riskIncluded.value,riskCompleted:riskCompleted.value,riskRequired:requiredRisk.value,riskText:riskText.value,riskChoices:{...riskChoices},assessmentEvidence:assessmentEvidence.value,underlyingServiceCode:underlyingServiceCode.value,serviceReason:serviceReason.value};}
function stashRecovery(){if((dirty.value || savePromise) && context.value && !readOnly.value)stashClinicalRecovery(recoveryIdentity(),recoverySnapshot(),serverRecoveryFingerprint);}
async function restoreRecovery(){const item=recoveryCopy.value;if(!item || readOnly.value)return;const snapshot=item.snapshot;hydrating=true;narrative.value=snapshot.narrative;output.value={...output.value,...snapshot.output,meta:{...output.value.meta,...snapshot.output.meta}};smart.value=snapshot.smart;Object.assign(encounter,snapshot.encounter);sessionPresentingProblemOverride.value=typeof snapshot.output?.meta?.narrivaContext?.presentingProblemOverride==='string'?snapshot.output.meta.narrivaContext.presentingProblemOverride:null;for(const key of Object.keys(ratings))delete ratings[key];Object.assign(ratings,snapshot.ratings);mode.value=snapshot.mode;riskIncluded.value=snapshot.riskIncluded;riskCompleted.value=snapshot.riskCompleted;riskRequiredLatched.value=requiredRisk.value || snapshot.riskRequired;riskText.value=snapshot.riskText;Object.assign(riskChoices,snapshot.riskChoices);assessmentEvidence.value=snapshot.assessmentEvidence || [];underlyingServiceCode.value=snapshot.underlyingServiceCode || '';serviceReason.value=snapshot.serviceReason || '';await nextTick();hydrating=false;dirty.value=true;revision++;accurate.value=false;necessary.value=false;recoveryNeedsSave.value=true;recoveryCopy.value=null;invalidate();notice.value='Recovered text is in this editor. Review it, then choose Save draft. No server content was replaced.';}
function discardRecovery(){if(recoveryCopy.value)discardClinicalRecovery(recoveryCopy.value.key);recoveryCopy.value=null;}
function beforeHidden(){if(document.visibilityState==='hidden'){stashRecovery();void save();}}
function pageHidden(){stashRecovery();void save();}
function beforeUnload(event){if(dirty.value){stashRecovery();event.preventDefault();event.returnValue='';}}
async function refreshServiceStatus(){const sessionId=context.value?.session?.id,current=generation;if(!sessionId)return;try{const {data}=await api.value.get(`/sessions/${sessionId}/service`);if(current!==generation)return;pendingConfirmation.value=data.pendingConfirmation || data.session?.pendingConfirmation || null;servicePendingOther.value=!!(data.pendingServiceChange || data.session?.pendingServiceChange) && !pendingConfirmation.value;serviceVerificationError.value='';if(pendingConfirmation.value){encounter.serviceCode=pendingConfirmation.value.serviceCode;serviceReason.value=pendingConfirmation.value.justification;invalidate();}if(data.serviceCode || data.session?.serviceCode)context.value={...context.value,session:{...context.value.session,...data.session,serviceCode:data.serviceCode || data.session.serviceCode}};}catch(e){if(current===generation)serviceVerificationError.value=e.response?.data?.error?.message || 'The actual encounter service could not be verified. Retry before saving or generating.';}}
async function confirmService(){if(serviceSaving.value || servicePendingOther.value || serviceReason.value.trim().length<5 || !serviceChanged.value)return;serviceSaving.value=true;error.value='';try{let sessionId=context.value.session?.id;if(!sessionId){const linked=await api.value.post('/sessions/bootstrap',{agencyId:agencyId.value,clientId:context.value.client.id,officeEventId:context.value.session?.officeEventId});sessionId=linked.data.session?.id || linked.data.clinicalSessionId;if(!sessionId)throw new Error('The real encounter could not be linked.');}const {data}=await api.value.post(`/sessions/${sessionId}/service`,{serviceCode:pendingConfirmation.value?.serviceCode || encounter.serviceCode,previousServiceCode:pendingConfirmation.value?.expectedOldServiceCode || context.value.session?.serviceCode || '',confirmed:true,justification:pendingConfirmation.value?.justification || serviceReason.value.trim(),durationMinutes:Number(encounter.durationMinutes),modality:encounter.modality});context.value={...context.value,session:{...context.value.session,...data.session,id:sessionId,serviceCode:data.serviceCode || data.session?.serviceCode || encounter.serviceCode}};encounter.serviceCode=data.serviceCode || data.session?.serviceCode || encounter.serviceCode;pendingConfirmation.value=null;servicePendingOther.value=false;serviceReason.value='';markDirty();notice.value='Service change confirmed. Review or regenerate the note for the selected service.';}catch(e){error.value=e.response?.data?.error?.message || 'The encounter service was not changed. Review its eligibility and try again.';}finally{serviceSaving.value=false;}}
async function back(){if(dirty.value && !await save())return;backInMobile(router,{path:'/mobile/workspace',query:{view:'mywork'}});}
async function openProfile(){if(dirty.value && !await save())return;router.push({path:'/mobile/workspace',query:{view:'client',clientId:String(context.value.client.id)}});}
function useRecording(append=false){narrative.value=append && narrative.value.trim()?`${narrative.value}\n\n${recordingText.value}`:recordingText.value;markDirty();}
function toggleIntervention(value){const list=smart.value.interventionsSelected;smart.value.interventionsSelected=list.includes(value)?list.filter(item=>item!==value):[...list,value];}
function focusFinding({checkId,finding}){if(finding?.action==='clinical_service'){nextTick(()=>{const field=document.getElementById('mobile-underlying-service');field?.scrollIntoView?.({block:'center',behavior:'smooth'});field?.focus();});return;}if(finding?.action==='assessment'){showAssessmentEvidence.value=true;nextTick(()=>document.getElementById('mobile-assessment-evidence')?.scrollIntoView?.({block:'start',behavior:'smooth'}));return;}document.getElementById(checkId==='risk_safety'?(mode.value==='narriva'?'mobile-assessment-todos':'mobile-risk-assessment'):checkId==='service_code'?'mobile-encounter-details':'mobile-session-narrative')?.scrollIntoView?.({block:'start',behavior:'smooth'});}
watch(()=>[context.value?.client?.id,encounter.dateOfService,showOutput.value && mseRequired.value && !readOnly.value],async([clientId,dateOfService,needed],_,onCleanup)=>{
  let active=true;onCleanup(()=>{active=false;});mseHistory.value=[];
  if(!needed || !clientId || !dateOfService)return;
  try {const {data}=await api.value.get(`/clients/${clientId}/mse-history`,{params:{dateOfService}});if(active)mseHistory.value=data.history || [];} catch { /* Manual assessment remains available. */ }
});
watch(()=>[mode.value,generationInput(),encounter.serviceCode,output.value.meta?.generationReceipt],refreshGeneration,{deep:true});
watch(review,value=>{
 if(value?.riskAssessmentRequired===true)riskRequiredLatched.value=true;
 const risk=value?.checks?.find(check=>check.id==='risk_safety');
 const recordedBypass=risk?.status==='bypassed' && risk.findings?.some(finding=>finding.bypassed) || value?.priorDecisions?.some(decision=>decision.checkId==='risk_safety');
 if(value?.riskAssessmentRequired===false && recordedBypass)riskRequiredLatched.value=false;
},{deep:true});
async function loadAssessmentContext(){const current=++assessmentRequest;if(!context.value?.client?.id || !['90791','H0031'].includes(encounter.serviceCode)){assessmentContext.value=null;return;}try{const {data}=await api.value.get(`/clients/${context.value.client.id}/assessment-context`,{params:{agencyId:agencyId.value,serviceCode:encounter.serviceCode,dateOfService:encounter.dateOfService,clinicalSessionId:context.value.session?.id},skipGlobalLoading:true});if(current===assessmentRequest){assessmentContext.value=data;if(!assessmentKindConfirmed.value)assessmentKind.value=data.automaticKind || 'initial';}}catch{if(current===assessmentRequest)assessmentContext.value=null;}}
watch(()=>[context.value?.client?.id,encounter.serviceCode,encounter.dateOfService],()=>{if(!hydrating)diagnosesConfirmed.value=false;void loadAssessmentContext();});
watch([assessmentKind,assessmentKindConfirmed,diagnosesConfirmed,sessionPresentingProblemOverride,narrative,output,smart,encounter,ratings,riskIncluded,riskCompleted,riskText,riskChoices,mode,assessmentEvidence,underlyingServiceCode],markDirty,{deep:true});
watch(()=>JSON.stringify(selection.value),async()=>{if(dirty.value && !await save())return;await load();},{immediate:true});
onBeforeRouteUpdate(async(to,from)=>{if(to.fullPath!==from.fullPath && dirty.value)return await save();});
onBeforeRouteLeave(async()=>!dirty.value || await save());
onMounted(()=>{document.addEventListener('visibilitychange',beforeHidden);window.addEventListener('pagehide',pageHidden);window.addEventListener('beforeunload',beforeUnload);});
onBeforeUnmount(()=>{stashRecovery();disposed=true;generation++;clearTimeout(saveTimer);clearTimeout(completionTimer);invalidate();document.removeEventListener('visibilitychange',beforeHidden);window.removeEventListener('pagehide',pageHidden);window.removeEventListener('beforeunload',beforeUnload);});
</script>

<template>
  <section class="mobile-note-workspace"><button type="button" class="mn-back" @click="back">← Back</button><header><div><p>Note Workspace</p><h1>{{ readOnly ? 'Finalized note' : 'Document this session' }}</h1></div><img :src="NARRIVA_BRAND.logo" alt="Narriva by AuricWell" /></header><p v-if="loading" role="status">Loading your session and note…</p><p v-if="error" class="mn-error" role="alert">{{ error }}</p><p v-if="recoveryWarning" class="mn-alert" role="alert">{{ recoveryWarning }}</p><p v-if="notice" class="mn-notice" role="status">{{ saving?'Saving…':notice }}</p>
    <template v-if="context && !loading"><button type="button" class="mn-client" @click="openProfile"><strong>{{ context.client?.maskedName || 'Client' }}</strong><span>{{ context.client?.age != null ? `Age ${context.client.age}` : 'Age unavailable' }}</span><span>Contact &amp; profile ›</span></button><p v-for="(alert,index) in context.alerts" :key="alert.id || index" class="mn-alert">{{ alert.message || alert }}</p>
      <section v-if="recoveryCopy && !readOnly" class="mn-card mn-recovery" role="status"><h2>Unsaved text is available</h2><p>Text from this same account and encounter was kept in this app’s memory when it locked. Nothing has replaced the current server draft.</p><p v-if="recoveryCopy.serverChanged">The server draft has also changed. Review the recovered copy before saving.</p><button type="button" @click="restoreRecovery">Restore unsaved draft</button><button type="button" @click="discardRecovery">Discard recovery copy</button></section>
      <NarrivaModeChooser compact v-if="!readOnly" v-model="mode" :default-mode="defaultMode" :allow-manual="context.preferences?.features?.manualAllowed !== false" :allow-narriva="context.preferences?.features?.writing !== false" :allow-smart="context.preferences?.features?.writing !== false" :saving="preferenceSaving" :error="preferenceError" @save-default="setDefault" />
      <details v-if="readOnly" id="mobile-encounter-details" class="mn-card" open><summary>Encounter details</summary><dl class="mn-encounter-summary"><div v-for="[label,value] in encounterSummary" :key="label"><dt>{{label}}</dt><dd>{{value || 'Not recorded'}}</dd></div></dl><p class="mn-original-consent"><span aria-hidden="true">{{originalConsent.confirmed?'✓':'○'}}</span> {{originalConsent.label}}</p></details>
      <details v-else id="mobile-encounter-details" class="mn-card" open><summary>Encounter details</summary><div class="mn-fields"><label>Date of service<input v-model="encounter.dateOfService" type="date" :disabled="readOnly" /></label><div class="mn-service-field"><label>Service<select v-model="encounter.serviceCode" :disabled="readOnly"><option value="">Select service</option><option v-for="item in context.serviceCodes" :key="item.code || item.serviceCode" :value="item.code || item.serviceCode">{{ item.code || item.serviceCode }} · {{ item.label || item.name }}</option></select></label><ServiceInformation presentation="button" :service-code="encounter.serviceCode" :agency-id="context.agencyId" :service-info="service?.serviceInfo || null" :api-client="api" reference-base-path="/service-reference" /></div><label>Start<input :value="encounter.startTimeLocal" @input="editEncounterTime('startTime', $event.target.value)" type="time" :disabled="readOnly" /></label><label>End<input :value="encounter.endTimeLocal" @input="editEncounterTime('endTime', $event.target.value)" type="time" :disabled="readOnly" /></label><label>Duration (minutes)<input :value="encounter.durationMinutes" @input="editEncounterTime('durationMinutes', $event.target.value)" type="number" min="1" :disabled="readOnly" /></label><label class="mn-wide">Participants<select v-model="encounter.participants" :disabled="readOnly"><option value="">Choose participants</option><option v-if="encounter.participants && !['Client Only','Client and Parent/Guardian','Parent/Guardian without Client','Client and Other Participants'].includes(encounter.participants)" :value="encounter.participants">{{ encounter.participants }}</option><option>Client Only</option><option>Client and Parent/Guardian</option><option>Parent/Guardian without Client</option><option>Client and Other Participants</option></select></label><ClinicalLocationPicker :client-present="clientPresent" class="mn-wide" :model-value="encounter" :choices="locationChoices" :disabled="readOnly" :unavailable="context.locationChoicesUnavailable" @update:model-value="Object.assign(encounter,$event)" /></div><label v-if="mode!=='narriva'" class="mn-check"><input v-model="encounter.consentConfirmed" type="checkbox" :disabled="readOnly" />I confirm consent to participate was obtained for this encounter.</label></details>
      <NarrivaClinicalAssist v-if="!readOnly" kind="service" :agency-id="agencyId" :source-text="narrative" :transport="api" @apply="applyClinicalAssist" />
      <section v-if="isProBonoFundingCode(encounter.serviceCode)" class="mn-card"><div class="mn-service-field"><label>Clinical service provided<select id="mobile-underlying-service" v-model="underlyingServiceCode" :disabled="readOnly"><option value="">Choose clinical service</option><option v-if="underlyingServiceCode && !underlyingOptions.some(item => item.code === underlyingServiceCode)" :value="underlyingServiceCode" disabled>{{ underlyingServiceCode }} · Eligibility needs review</option><option v-for="item in underlyingOptions" :key="item.code" :value="item.code">{{ item.code }} · {{ item.label || item.name || item.code }}</option></select></label><ServiceInformation presentation="button" :service-code="underlyingServiceCode" :agency-id="context.agencyId" :service-info="underlyingOptions.find(item => item.code === underlyingServiceCode)?.serviceInfo || null" :api-client="api" reference-base-path="/service-reference" /></div><p>Pro Bono remains the funding arrangement. This choice identifies the clinical service for documentation review and does not change its scheduled or charged code.</p><p v-if="!underlyingServiceCode">Choose the clinical service to verify its handbook requirements. Until then, this note remains unverified.</p></section>
      <p v-if="serviceVerificationError" class="mn-alert" role="alert">{{ serviceVerificationError }} <button type="button" @click="refreshServiceStatus">Retry service verification</button></p>
      <section v-if="serviceChanged && !readOnly" class="mn-card mn-service-confirm"><h2>{{ pendingConfirmation ? 'Finish pending service change' : 'Confirm service-code change' }}</h2><p v-if="pendingConfirmation">The prior confirmation is pending. Review the preserved service and reason, then explicitly retry it.</p><p v-if="servicePendingOther">Another authorized service change is pending. Its author must finish it before this note can proceed.</p><p>The scheduled encounter still uses {{ context.session?.serviceCode || 'its original service' }}. Narriva will not change a billed service automatically.</p><label>Reason / crisis justification<textarea v-model="serviceReason" :readonly="!!pendingConfirmation || servicePendingOther" rows="3" minlength="5" maxlength="4000" /></label><button type="button" :disabled="serviceSaving || servicePendingOther || serviceReason.trim().length<5" @click="confirmService">{{ serviceSaving?'Checking eligibility…':pendingConfirmation?'Retry confirmation':'Confirm service change' }}</button></section>
      <section v-if="!readOnly && clinicalContextDiagnosisMode !== 'none'" class="mn-card"><h2>Diagnosis assistance</h2><NarrivaClinicalAssist :agency-id="agencyId" :source-text="narrative" :diagnosis-mode="encounter.serviceCode==='H0031'?'zr_only':clinicalContextDiagnosisMode" :date-of-service="encounter.dateOfService" :transport="api" :search="searchClinicalDiagnosis" @apply="applyClinicalAssist" /><ExternalClinicalDiagnosis :agency-id="agencyId" :client-id="context.client.id" :session-id="context.session?.id" :date-of-service="encounter.dateOfService" :transport="api" :search="searchClinicalDiagnosis" @saved="recordOutsideDiagnosis" /></section>
      <section v-if="encounter.serviceCode==='H0031' && !readOnly" class="mn-card"><label>Assessment type<select v-model="assessmentKind" @change="assessmentKindConfirmed=false"><option value="initial">Initial assessment</option><option value="additional">Additional / collateral assessment</option></select></label><label v-if="assessmentKind!==(assessmentContext?.automaticKind || 'initial')" class="mn-check"><input v-model="assessmentKindConfirmed" type="checkbox" /> I confirm the assessment type matches this service.</label></section>
      <details v-if="goals.length" id="mobile-treatment-objectives" ref="objectivePanel" class="mn-card"><summary>Treatment plan &amp; current scores</summary><p v-if="error===objectiveReviewMessage" role="alert">{{error}}</p><section v-for="goal in goals" :key="goal.id"><h3>{{ goal.title || goal.goal_text }}</h3><div v-for="objective in goal.objectives" :key="objective.id" class="mn-objective"><span>{{ objective.title || objective.objective_text }}<span class="mn-rating-key"><b class="original">Original {{ objective.scaleStart ?? '—' }}</b><b class="previous">Previous {{ objective.previousScore ?? '—' }}</b><b class="goal">Goal {{ objective.scaleTarget ?? '—' }}</b></span></span><div v-if="!readOnly" class="mn-rating-buttons" role="group" :aria-label="'Current score for '+objective.title">
          <div class="mn-rating-scale"><button v-for="score in 10" :key="score" :class="{original:Number(objective.scaleStart)===score,previous:Number(objective.previousScore)===score,goal:Number(objective.scaleTarget)===score}" type="button" :aria-pressed="Number(ratings[objective.id])===score" @click="ratings[objective.id]=score">{{score}}</button></div>
          <div class="mn-rating-dispositions"><button v-for="(label,value) in objectiveDispositions" :key="value" type="button" :aria-pressed="ratings[objective.id]===value" @click="ratings[objective.id]=value">{{label}}</button></div>
        </div><small v-if="ratings[objective.id]!=null">{{objectiveDispositions[ratings[objective.id]] || ("Current score "+ratings[objective.id])}}</small></div></section></details>
      <section v-if="mode === 'smart_notes' && !readOnly" class="mn-card mn-smart"><h2>Smart Notes</h2><p>Guided note builder · Powered by Narriva</p><nav aria-label="Guided note steps"><button v-for="(title,index) in ['Focus','Interventions','Response','Necessity','Plan']" :key="title" type="button" :aria-pressed="smartStep===index" @click="smartStep=index">{{ index+1 }}. {{ title }}</button></nav><label v-if="smartStep===0">Session focus<textarea v-model="smart.sessionFocus" rows="5" /></label><template v-else-if="smartStep===1"><p>Select interventions actually used.</p><div class="mn-chips"><button v-for="item in CS_DEFAULT_INTERVENTIONS.slice(0,12)" :key="item" type="button" :aria-pressed="smart.interventionsSelected.includes(item)" @click="toggleIntervention(item)">{{ item }}</button></div><label>Other interventions and how they were used<textarea v-model="smart.interventionsCustom" rows="4" /></label></template><label v-else-if="smartStep===2">Engagement and response to interventions<textarea v-model="smart.clientResponseMore" rows="5" /></label><label v-else-if="smartStep===3">Symptoms, functional impact and medical necessity<textarea v-model="smart.medicalNecessityNarrative" rows="5" /></label><label v-else>Progress and plan for next service<textarea v-model="smart.planEdited" rows="5" /></label><div class="mn-step-actions"><button v-if="smartStep>0" type="button" @click="smartStep--">Previous</button><button v-if="smartStep<4" type="button" @click="smartStep++">Next</button></div></section>
      <section v-if="mode==='manual' && !readOnly" class="mn-card">
        <h2>Session details</h2>
        <NarrivaSessionConfirmations :client-present="clientPresent" :risk-required="requiredRisk" :location="encounter" v-model:consent="encounter.consentConfirmed" v-model:risk="riskIncluded" />
        <button type="button" :disabled="enrollmentLoading || manualBlocked" @click="loadEnrollment">Load enrollment information</button>
      </section>
      <section v-if="mode==='manual' && !readOnly && aidKind(encounterAid)==='intake' && ['full','zr_only'].includes(clinicalContextDiagnosisMode)" class="mn-card">
        <h2>Diagnoses and clinical justification</h2>
        <ClinicalDiagnosisSearch v-model="manualDxQuery" :search="searchClinicalDiagnosis" :agency-id="agencyId" :date-of-service="encounter.dateOfService" :filter-results="diagnosisAllowed" @select="selectManualDiagnosis" />
        <ClinicalDiagnosisFields :criteria-context="{agencyId,draftId,transport:api,ensureSaved:async()=>await save(true)}" :model-value="clinicalDiagnoses" @update:model-value="updateAssessment('diagnoses',$event)" />
      </section>
      <section v-if="mode==='narriva' && !readOnly" id="mobile-session-narrative" class="mn-card"><h2>Session Narrative</h2><p class="mn-privacy">Please do not enter or speak names, dates of birth, contact details, or other identifiers here. Use Client, Provider, parent or guardian.</p><textarea v-model="narrative" aria-label="Session Narrative" rows="8" maxlength="150000" placeholder="Describe what occurred, the interventions, response, progress, and next plan…" /><NarrivaSessionConfirmations :client-present="clientPresent" :risk-required="requiredRisk" :location="encounter" v-model:consent="encounter.consentConfirmed" v-model:risk="riskIncluded" /><label v-if="allowComplexity" class="mn-check"><input v-model="encounter.interactiveComplexitySelected" type="checkbox" /> Interactive complexity (90785)</label><template v-if="recordingText && recordingText !== narrative"><p>A reviewed recording narrative is available for this encounter.</p><button type="button" @click="useRecording(true)">Append recording narrative</button><button type="button" @click="useRecording(false)">Replace with recording narrative</button></template></section>
      <button v-if="mode!=='manual' && !readOnly" type="button" class="mn-generate" :disabled="generating || saving || preparingReview || reviewBusy || blockingAlerts.length>0 || (preflightReady && !draftApproved)" @click="preGenerationRequired && !preflightReady ? checks({phase:'pre_generation'}) : generate()"><img :src="NARRIVA_BRAND.icon" alt="" />{{ generating?'Generating your note…':reviewBusy?'Checking your session…':preGenerationRequired && !preflightReady?(review?.id?'Re-generate note and check':'Submit for compliance check'):'Finalize note' }}</button>
      <p v-if="error && mode!=='manual'" role="alert">{{ error }}</p>
      <p v-if="hasContent && !showOutput" class="mn-notice">Saved note content is preserved. Generate from the Session Narrative, or choose Manual Writer to edit the saved note.</p>
      <section v-if="showOutput" ref="notePanel" class="mn-card mn-note"><p v-if="mode!=='manual' && !readOnly && !generatedCurrent" class="mn-alert">The source has changed. Generate again before checking or signing this note.</p><h2>{{ readOnly?'Signed note':mode==='manual'?'Manual writer':'Generated note' }}</h2>
        <section v-if="hasRatingSummary" class="mn-session-scores"><h3>{{ ratingSectionTitle }}</h3><p>{{savedRatingsText}}</p></section>
        <template v-if="readOnly"><section v-for="(text,title) in sections" :key="title" class="mn-signed-section"><h3>{{title}}</h3><p>{{clinicalNarrativeDisplay(text,displayTimeZone)}}</p><details v-if="clinicalNarrativeDisplay(text,displayTimeZone)!==String(text || '')" class="mn-original-text"><summary>Original signed text</summary><p>{{text}}</p></details></section></template><template v-else-if="mode==='narriva'">
        <section v-for="(text,title) in displayedSections" :key="title" class="mn-draft-section">
          <header><h3>{{title}}</h3><button v-if="!['Presenting Problem','Diagnosis','Diagnoses on file','Diagnostic Justification'].includes(title)" type="button" :disabled="manualBlocked || !generatedCurrent" :aria-label="(editingNoteSection===title?'Done editing ':'Edit ')+title" @click="editingNoteSection=editingNoteSection===title?'':title">{{editingNoteSection===title?'Done':'Edit'}}</button></header>
          <textarea v-if="editingNoteSection===title" v-model="output.sections[title]" :aria-label="`${title} note section`" rows="6" />
          <p v-else>{{text}}</p>
        </section>
      </template><template v-else><label v-for="(_text,title) in sections" :key="title">{{ title }}<textarea v-model="output.sections[title]" :aria-label="`${title} note section`" rows="5" :disabled="readOnly || manualBlocked || mode!=='manual' && !generatedCurrent" /></label></template><p v-if="manualBlocked">Manual editing is disabled by your profile. Choose an available writer to continue; the existing content is preserved.</p><button v-if="!readOnly" type="button" :disabled="saving || manualBlocked || !hasContent && !narrative.trim()" @click="save(true)">{{ saving?'Saving…':'Save draft' }}</button></section>
      <section v-if="showOutput && !readOnly && mode!=='smart_notes' && (mseRequired || riskIncluded || requiredRisk)" id="mobile-assessment-todos" class="mn-card">
        <h2>{{ assessmentPending ? 'To do before signing' : 'Assessments complete' }}</h2>
        <NoteAidStructuredChartPanel assessment-todo :show-medications="false" diagnosis-mode="none" :skip-mse="!mseRequired" :mse-history="mseHistory" :mse="assessmentChart.mentalStatusExam || undefined" :risk="assessmentChart.riskAssessment || undefined" :include-risk="clientPresent !== false && (riskIncluded || requiredRisk)"
          @update:mse="updateAssessment('mentalStatusExam',$event)" @update:risk="updateAssessment('riskAssessment',$event)"
          @mse-all-normal="updateAssessment('mentalStatusExam',buildAllNormalMse())" @mse-all-not-assessed="updateAssessment('mentalStatusExam',buildAllNotAssessedMse())" />
        <label v-if="clientPresent !== false && (riskIncluded || requiredRisk)" class="mn-check"><input v-model="riskCompleted" :disabled="!riskDomainComplete" type="checkbox" /> I completed and reviewed this risk assessment.</label>
      </section>
      <label v-if="assessmentContext?.requiresDiagnosisConfirmation && !readOnly" class="mn-check"><input v-model="diagnosesConfirmed" type="checkbox" /> I reviewed and confirm the carried diagnoses and clinical justifications, including any updates.</label>
      <section v-if="showProviderSign && !canCosign" class="mn-card mn-sign"><h2>Review &amp; sign</h2><p v-if="assessmentPending">Complete the assessment above to sign.</p><p v-if="signing || reviewBusy" role="status">{{signing?'Finishing your signature request…':'Reviewing the generated note…'}}</p><p v-if="error" role="alert">{{error}}</p><label class="mn-check"><input v-model="accurate" type="checkbox" />I reviewed this note and confirm it is accurate and complete.</label><label class="mn-check"><input v-model="necessary" type="checkbox" />I attest that this service was medically necessary.</label><p v-if="!context.session?.id">An authorized encounter must be linked before chart signing.</p><button type="button" :disabled="signing || saving || reviewBusy || manualBlocked || serviceChanged || !!serviceVerificationError || !accurate || !necessary || !hasContent || !context.session?.id || context.note?.canSignClinicalNote === false || blockingAlerts.length>0 || assessmentPending" @click="sign">{{ signing ? 'Signing & saving…' : 'Sign & save to chart' }}</button></section>
      <SessionSupportingMaterials v-if="context.session?.id && !readOnly" :clinical-session-id="context.session.id" :transport="api" base-path="" />
      <ConfidentialClinicalEntries v-if="context.session?.id && context.client?.id && !readOnly" attached :agency-id="agencyId" :client-id="context.client.id" :session-id="context.session.id" :draft-id="draftId" :ensure-draft="async () => await save(true) && draftId" :transport="api" base-path="" />
      <InternalDiagnosticCriteriaReview v-if="readOnly || canCosign" :agency-id="agencyId" :client-id="context.client?.id" :note-id="context.note?.id || undefined" :transport="api" />
      <MobileNoteSignatures v-if="readOnly" :signatures="displayedSignatures" :time-zone="displayTimeZone" />
      <div ref="reviewAnchor" class="mn-review-anchor">
      <NarrivaReviewWorkspace @approval="draftApproval = $event" @edit="resolveFinding({action:'edit_draft',sections:$event})" v-if="mode !== 'manual' && (reviewStarted || preparingReview || reviewBusy)" :review="review" :busy="!signing && (preparingReview || reviewBusy)" :pre-generation="reviewPhase === 'pre_generation'">
      <NarrivaCompliancePanel :supervisor-view="canCosign" :pre-generation="reviewPhase==='pre_generation'" v-if="(readOnly || mode !== 'manual') && !preparingReview && !reviewBusy && (prepared || reviewPhase==='pre_generation') && reviewStarted && (review || reviewBusy || reviewError || requiredRisk || riskIncluded)" :read-only="readOnly" :review="review" :risk-assessment-required="requiredRisk" :busy="reviewBusy" :error="reviewError" @retry="checks" @resolve="resolveFinding" @action="focusFinding"><template v-if="mode==='narriva' && reviewPhase==='pre_generation'" #finding="{checkId,finding}"><NarrivaInlineFinding v-if="!finding.bypassed" :check-id="checkId" :finding="finding" :context="inlineContext" :location-choices="locationChoices" :diagnosis-search="searchClinicalDiagnosis" :disabled="reviewBusy || readOnly" @apply="applyInlineUpdate" /></template><template v-if="preflightReady" #generate><button type="button" :disabled="!draftApproved || generating || saving || blockingAlerts.length>0" @click="generate">{{ generating ? 'Generating your note…' : 'Finalize note' }}</button><p v-if="error" role="alert">{{ error }}</p></template><template #risk><label v-if="mode!=='narriva' && !requiredRisk && !readOnly" class="mn-check"><input v-model="riskIncluded" type="checkbox" /> Include a risk assessment</label><p v-if="requiredRisk && reviewPhase!=='pre_generation'">Required for this note</p><p v-if="reviewPhase==='pre_generation' && riskIncluded" class="mn-notice">Risk assessment will be a to-do in the generated note. Complete it before signing.</p><section v-if="mode!=='narriva' && reviewPhase!=='pre_generation' && (requiredRisk || riskIncluded)" id="mobile-risk-assessment"><label v-for="domain in riskDomains" :key="domain">{{ domain }}<select v-model="riskChoices[domain]" :disabled="readOnly"><option value="">Choose assessed finding</option><option>Denied</option><option>Present</option><option>Unable to assess</option></select></label><label>Risk assessment and safety interventions<textarea v-model="riskText" :disabled="readOnly" rows="5" placeholder="Document the assessment actually performed, findings, and any safety interventions." /></label><label class="mn-check"><input v-model="riskCompleted" :disabled="readOnly" type="checkbox" />I completed and reviewed this documented risk assessment.</label></section></template></NarrivaCompliancePanel>
      </NarrivaReviewWorkspace></div>
      <NarrivaAssessmentEvidence v-if="!readOnly && (showAssessmentEvidence || assessmentEvidence.length)" id="mobile-assessment-evidence" v-model="assessmentEvidence" :agency-id="context.agencyId" :client-id="context.client?.id" :clinical-session-id="context.session?.id" :draft-id="draftId" :note-id="context.note?.id" :api-client="api" base-url="/assessments" />
      <button v-if="!readOnly && hasContent && prepared && mode==='smart_notes'" type="button" :disabled="reviewBusy || saving" @click="checks">{{ reviewBusy?'Checking…':mode==='manual'?'Check Note':'Run Narriva checks' }}</button>
      <section v-if="readOnly" class="mn-card mn-submission-review"><h2>Narriva results at submission</h2><p>{{review?'The author’s saved review and any findings are shown above. Supervisor approval does not rerun Narriva.':'No completed Narriva review is on file for this submission. Ordinary documentation review remains available.'}}</p></section>
      <section v-if="savedSignature" class="mn-card mn-signature" role="status"><h2>{{savedSignature.kind==='cosign'?'Supervisor signature saved':'Provider signature saved'}}</h2><p>{{signatureDate(savedSignature.cosignedAt || savedSignature.signedAt)}}</p><p>{{savedSignature.openNext?'Opening the next note awaiting co-sign…':'Returning to My Work…'}}</p></section>
      <section v-if="canCosign" class="mn-card mn-sign"><h2>Supervisor review</h2><label class="mn-check"><input v-model="cosignAttested" type="checkbox" :disabled="signing" />I reviewed the current note, encounter details and attached entries and approve this documentation under my supervisory responsibility.</label><button v-if="review?.status==='passed' && review?.quickSignEligible===true" type="button" class="mn-quick-sign" :disabled="signing || reviewBusy || !cosignAttested" @click="cosign(true)">✓ Quick Sign</button><button type="button" :disabled="signing || !cosignAttested" @click="cosign(false)">{{ signing?'Saving signature…':'Review &amp; co-sign' }}</button><button type="button" :disabled="signing || !cosignAttested" @click="cosign(false,true)">Co-sign &amp; open next</button></section>

    </template>
  </section>
</template>

<style scoped>
.mn-service-field{display:flex;align-items:flex-end;gap:8px;min-width:0}.mn-service-field>label{flex:1;min-width:0}.mn-service-field>.service-information{align-self:flex-end;margin-bottom:6px}

.mobile-note-workspace{background:#f7f9fc;padding:15px;color:#173754;min-width:0}.mobile-note-workspace button{font:inherit;cursor:pointer;border:1px solid #cbd8e5;border-radius:9px;background:#f3f7fc;color:#23577f;padding:10px 12px}.mobile-note-workspace button:disabled{opacity:.5;cursor:default}.mn-back{margin-bottom:16px}.mobile-note-workspace>header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}.mobile-note-workspace header p{font-size:11px;letter-spacing:.07em;text-transform:uppercase;margin:0;color:#6c8194}.mobile-note-workspace h1{font-size:21px;margin:5px 0}.mobile-note-workspace header>img{width:125px;max-width:37%;height:auto}.mn-client{display:flex;align-items:center;flex-wrap:wrap;gap:8px;width:100%;text-align:left;background:#fff!important;border-color:#d9e3ed!important;margin-bottom:15px}.mn-client strong{font-size:16px;flex:1}.mn-client span{font-size:12px;color:#6b8195}.mn-client span:last-child{font-size:10px;color:#23577f}.mn-card{background:#fff;border:1px solid #dbe4ee;border-radius:12px;padding:15px;margin:14px 0}.mn-card summary{font-weight:650;cursor:pointer;font-size:15px}.mn-card h2{font-size:17px;margin:0 0 12px}.mn-card h3{font-size:13px;margin:15px 0 8px}.mn-card p{font-size:12px;line-height:1.6;color:#6b8092}.mobile-note-workspace label{display:block;font-size:12px;color:#42617b;margin:11px 0;font-weight:550}.mobile-note-workspace input:not([type=checkbox]):not([type=radio]),.mobile-note-workspace textarea,.mobile-note-workspace select{display:block;box-sizing:border-box;width:100%;font:inherit;font-size:15px;margin-top:6px;border:1px solid #cbd9e6;padding:11px 10px;border-radius:8px;background:#fff;color:#173754;min-width:0}.mobile-note-workspace textarea{resize:vertical;line-height:1.6}.mn-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 10px;margin-top:10px}.mn-wide{grid-column:1/-1}.mobile-note-workspace .mn-check{display:flex;align-items:flex-start;gap:8px;line-height:1.6;font-weight:400}.mn-check input{margin-top:4px;flex:none}.mn-objective{display:grid!important;grid-template-columns:minmax(0,1fr);gap:6px;border-top:1px solid #dae4ed;padding:12px 0}.mn-objective>span{width:100%;word-break:normal}.mn-objective input{min-height:44px;box-sizing:border-box}.mn-rating-key,.mn-rating-dispositions{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.mn-rating-key b{border-radius:6px;padding:3px 7px;font-size:.8rem}.mn-rating-scale{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}.mn-rating-key .original,.mn-rating-scale .original{background:#64748b;color:white}.mn-rating-key .previous,.mn-rating-scale .previous{background:#fbbf24;color:#432b04}.mn-rating-key .goal,.mn-rating-scale .goal{box-shadow:inset 0 0 0 2px #15803d;color:#125d31;background:#edf8ed}.mn-rating-dispositions button{white-space:nowrap;word-break:normal}.mn-rating-buttons button[aria-pressed=true]{outline:2px solid #0f766e;outline-offset:-2px}.mn-rating-buttons button{min-height:44px}.mn-rating-buttons button[aria-pressed=true]{background:#0f766e;color:white}.mn-review-anchor{scroll-margin-top:6rem}.mn-review-anchor p{display:grid;justify-items:center;gap:12px;padding:20px;background:white}.mn-review-anchor img{width:min(180px,70%)}.mn-objective>span{flex:1;line-height:1.5}.mn-objective small{display:block;font-size:10px;color:#7a8fa1}.mn-objective input{max-width:68px}.mn-smart nav{display:flex;gap:5px;overflow:auto;margin:10px 0 17px;padding-bottom:4px}.mn-smart nav button{font-size:11px;white-space:nowrap;padding:8px}.mn-smart button[aria-pressed=true]{background:#1c5885;color:#fff;border-color:#1c5885}.mn-chips{display:flex;flex-wrap:wrap;gap:6px}.mn-chips button{font-size:11px;padding:7px 9px}.mn-step-actions{display:flex;justify-content:space-between;gap:10px}.mobile-note-workspace .mn-generate{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;background:#174f7c;color:white;border-color:#b79648;box-shadow:0 2px 5px #12345515;font-weight:650}.mn-generate img{width:26px;height:26px;object-fit:contain;background:#fff;border-radius:6px;padding:3px}.mn-privacy{padding:10px;background:#f2f6fb;border-left:3px solid #caab55}.mn-risk-choice{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:12px;font-size:12px}.mn-risk-choice label{display:flex;align-items:center;gap:4px;margin:0}.mn-risk-choice>span{color:#94621e}.mn-sign>button{width:100%;background:#1e5a82;color:#fff}.mn-sign p{font-size:11px}.mn-error,.mn-alert{color:#a32d2a;background:#fff0ed;padding:11px;border-radius:8px;font-size:13px;line-height:1.6}.mn-notice{font-size:12px;color:#28744f}.mobile-note-workspace :deep(.narriva-modes){margin-bottom:14px}.mobile-note-workspace :deep(.narriva-compliance){padding:13px;margin:14px 0}.mobile-note-workspace :deep(.narriva-compliance footer){flex-wrap:wrap}@media(max-width:350px){.mobile-note-workspace{padding:10px}.mn-card{padding:11px}.mn-fields{gap:0 7px}.mobile-note-workspace input:not([type=checkbox]):not([type=radio]),.mobile-note-workspace select{font-size:13px;padding:10px 6px}}
</style>

<style scoped>
.mobile-note-workspace{font-size:14px;line-height:1.45;max-width:100%;box-sizing:border-box}.mn-card{min-width:0;padding:14px}.mn-fields{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.mn-fields>*{min-width:0;max-width:100%}.mobile-note-workspace input:not([type=checkbox]):not([type=radio]),.mobile-note-workspace select,.mobile-note-workspace textarea{box-sizing:border-box;width:100%;min-width:0;max-width:100%;font-size:16px!important;line-height:1.35;padding:9px 10px;min-height:42px}.mobile-note-workspace input[type=date],.mobile-note-workspace input[type=time]{display:block;appearance:none;-webkit-appearance:none}.mobile-note-workspace input::-webkit-date-and-time-value{min-width:0;text-align:left}.mn-fields label{font-size:12px;margin:6px 0}.mn-service-field{min-width:0;max-width:100%}.mn-service-field>label{min-width:0;flex:1}.mn-service-field :deep(.service-info-button){flex-shrink:0}.mobile-note-workspace h1{font-size:20px}.mobile-note-workspace h2,.mobile-note-workspace summary{font-size:16px}.mobile-note-workspace p{font-size:13px}.mn-check{font-size:13px;line-height:1.5}@media(max-width:520px){.mn-fields{grid-template-columns:minmax(0,1fr)}.mn-wide{grid-column:auto}.mobile-note-workspace{padding:12px}.mn-card{padding:12px}}
</style>

<style scoped>
.mobile-note-workspace{width:100%;overflow-wrap:anywhere}.mobile-note-workspace>header{min-width:0;flex-wrap:wrap}.mobile-note-workspace>header>*{min-width:0;max-width:100%}.mobile-note-workspace :deep(.narriva-modes){box-sizing:border-box;max-width:100%;min-width:0}.mobile-note-workspace :deep(.narriva-modes__footer){flex-wrap:wrap}.mobile-note-workspace :deep(.narriva-modes__options button>span){min-width:0}.mn-card{box-sizing:border-box;width:100%;max-width:100%}
</style>

<style scoped>.mn-session-scores,.mn-draft-section{padding:12px 0;border-top:1px solid #d8e3eb}.mn-session-scores p,.mn-draft-section p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;margin:.45rem 0}.mn-draft-section header{display:flex;align-items:center;justify-content:space-between;gap:10px}.mn-note .mn-draft-section button{font-size:.8rem;padding:5px 10px}.mn-encounter-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 10px;margin:16px 0}.mn-encounter-summary dt{font-size:11px;color:#627b91}.mn-encounter-summary dd{font-size:14px;font-weight:550;margin:4px 0 0;overflow-wrap:anywhere}.mn-original-consent{padding-top:10px;border-top:1px solid #e3eaf0}.mn-signed-section p{white-space:pre-wrap;font-size:14px;color:#18374f}.mn-sign>button+button{margin-top:10px}.mn-signature{border-color:#b7d8c6;background:#f0f9f4}</style>
