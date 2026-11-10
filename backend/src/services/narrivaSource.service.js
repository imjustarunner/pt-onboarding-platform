import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';
import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { decryptChatText } from './chatEncryption.service.js';
import { requireNarrivaAgency,requireNarrivaClient,parseNarrivaObject as parse,positiveId,narrivaError } from './narrivaAccess.service.js';
import { loadReviewDocument } from './clinicalReviewDocument.service.js';
import { resolveNoteDocumentationPolicy } from './supervisedBillingPolicy.service.js';
import { deriveCredentialTier,assertServiceCodeAllowed } from '../utils/clinicalServiceCodeEligibility.js';
import { resolveSessionBilling } from './serviceCodeUnits.service.js';
import { narrivaSourceHash,NARRIVA_RULES_VERSION } from './narrivaReviewPolicy.service.js';
import { readStaffCareEligibility } from './staffCareEligibility.service.js';
import { resolveAgencySchedulingCatalog } from './agencySchedulingCatalog.service.js';
import {completeNarrivaRiskAssessment} from './narrivaRiskAssessment.service.js';
import {loadNarrivaAssessmentEvidence} from './narrivaAssessmentEvidence.service.js';
import {assertNoPendingClinicalServiceChange} from '../utils/clinicalServiceChangePolicy.js';
import {isProBonoServiceCode,resolveProBonoDocumentationService} from '../utils/clinicalFundingPolicy.js';

export function decryptNarrivaDraft(value) {
 let raw=String(value || '');let item;try{item=JSON.parse(raw);}catch{return raw;}
 if(item?._enc===true)return maybeDecryptNotePayload(raw);
 if(item?.ciphertextB64 && item.ivB64)return decryptChatText(item);
 return raw;
}
export function narrivaNarrative(payload) {
 const plain=typeof payload==='string'?payload:JSON.stringify(payload || {});let value;
 try{value=JSON.parse(plain);}catch{return plain;}
 const sections=value.sections || value;
 if(typeof sections==='string')return sections;
 return Object.entries(sections).filter(([k,v])=>k!=='meta' && typeof v==='string').map(([k,v])=>`${k}:\n${v}`).join('\n\n');
}
const textPresent=value=>typeof value==='string'?value.trim().length>3:Array.isArray(value)?value.length>0:!!value && Object.values(value).some(v=>typeof v==='string' && v.trim().length>3);
export function narrivaLocalContext({source,meta,session={},provider={},serviceRule,documentationServiceRule}) {
 const chart=parse(meta.structuredChart),narriva=parse(meta.narrivaContext),context=parse(meta.sessionContext);
 const duration=Number(context.durationMinutes || meta.durationMinutes || session.actual_duration_minutes || session.duration_minutes || 0);
 const start=context.startTimeLocal || meta.startTimeLocal,end=context.endTimeLocal || meta.endTimeLocal;
 const clock=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(v || ''));return m && Number(m[1])<24 && Number(m[2])<60?Number(m[1])*60+Number(m[2]):null;};
 const a=clock(start),b=clock(end),hasInstants=!!(session.actual_start_at && session.actual_end_at);
 const instant=value=>value instanceof Date?value.getTime():new Date(/[Zz]|[+-]\d{2}:\d{2}$/.test(String(value))?value:String(value).replace(' ','T')+'Z').getTime();
 const actualMinutes=hasInstants?(instant(session.actual_end_at)-instant(session.actual_start_at))/60000:null;
 const code=String(source.service_code || meta.serviceCode || session.service_code || '').trim().toUpperCase();
 const proBono=isProBonoServiceCode(code),documentationCode=resolveProBonoDocumentationService({serviceCode:code,metadata:meta}).serviceCode;
 const clinicalRule=proBono?documentationServiceRule:serviceRule;
 let allowed=!!clinicalRule && clinicalRule.is_active!==false && clinicalRule.is_active!==0,reason='';
 const tier=deriveCredentialTier({userRole:provider.role,providerCredentialText:provider.credential});
 try{assertServiceCodeAllowed({tier,serviceCode:documentationCode || code});}catch(e){allowed=false;reason=e.message;}
 if(proBono && !documentationCode){allowed=false;reason='Select the actual clinical service provided. Pro bono remains the no-client-charge funding choice.';}
 if(!code || /\bET\b/.test(code)){allowed=false;reason='Choose a supported base service code.';}
 const savedCode=String(session.service_code || '').trim().toUpperCase();
 const metadataCode=String(meta.serviceCode || '').trim().toUpperCase();
 if(session.id && savedCode!==code || metadataCode && metadataCode!==code) {
  allowed=false;reason='Confirm the service change on the actual session before checking or signing this code.';
 }
 const rule=clinicalRule || {};
 const tiers=typeof rule.allowed_credential_tiers_json==='string'?parse(rule.allowed_credential_tiers_json):rule.allowedCredentialTiers || rule.allowed_credential_tiers_json;
 if(Array.isArray(tiers) && tiers.length && !tiers.includes(tier))allowed=false;
 const billing=clinicalRule?resolveSessionBilling({minutes:duration,serviceCode:documentationCode || code,unitCalcMode:rule.unit_calc_mode || rule.unitCalcMode,
  unitMinutes:rule.unit_minutes || rule.unitMinutes,minMinutes:rule.min_minutes ?? rule.minMinutes,maxMinutes:rule.max_minutes ?? rule.maxMinutes,
  maxUnitsPerSession:rule.max_units_per_session || rule.maxUnitsPerSession,ladderBandsJson:rule.ladder_bands_json || rule.ladderBandsJson}):{claimable:false};
 const participantText=String(context.participantsDetail || meta.participants || context.participants || '');
 const participantLower=participantText.toLowerCase();
 const modality=String(narriva.modality || context.modality || meta.modality || session.modality || '').trim();
 const pos=String(context.placeOfService || meta.placeOfService || session.place_of_service || '');
 const allowedPos=typeof rule.allowed_place_of_service_json==='string'?parse(rule.allowed_place_of_service_json):rule.allowedPlaceOfService || rule.allowed_place_of_service_json;
 const validMethod=['in_person','video','phone','in-person','telehealth','virtual'].includes(modality.toLowerCase());
 const remoteMethod=['video','phone','telehealth','virtual'].includes(modality.toLowerCase());
 const modalityAllowed=validMethod && (!Array.isArray(allowedPos) || !allowedPos.length || allowedPos.includes(pos)) && (remoteMethod?['02','10'].includes(pos):!['02','10'].includes(pos));
 const rawDiagnoses=chart.diagnoses || chart.intakeDiagnoses || meta.diagnoses || [];
 const diagnoses=Array.isArray(rawDiagnoses)?rawDiagnoses:[];
 return {
  encounter:{durationMinutes:duration,dateValid:/^\d{4}-\d{2}-\d{2}$/.test((source.date_of_service instanceof Date?source.date_of_service.toISOString():String(source.date_of_service || meta.dateOfService || '')).slice(0,10)),
   timesValid:duration>0 && (hasInstants?Number.isFinite(actualMinutes) && actualMinutes>0 && Math.round(actualMinutes)===duration:(a!==null && b!==null && ((b-a+1440)%1440)===duration)),
   location:String(context.locationLabel || context.placeOfService || meta.locationLabel || session.location_name || ''),
   modality,
   consentConfirmed:narriva.consentConfirmed===true,
   participants:participantText,clientPresent:narriva.clientPresent ?? chart.patientPresent ?? (participantLower.includes('client') && !participantLower.includes('without client')),
   additionalParticipantsDocumented:/parent|guardian|caregiver|partner|spouse|family|collateral|teacher|other/i.test(participantText)},
  clinical:{hasDiagnosis:Array.isArray(diagnoses) && diagnoses.some(d=>typeof d==='string'?d.trim():d.icd10_code || d.code || d.diagnosis),
   hasJustification:textPresent(chart.diagnosticJustification || meta.diagnosticJustification) || diagnoses.some(d=>textPresent(d.justification)),
   hasPresentingProblem:textPresent(narriva.presentingProblem || meta.presentingProblem || chart.presentingProblem),
   riskAssessmentComplete:narriva.riskAssessmentCompleted===true && completeNarrivaRiskAssessment(chart.riskAssessment),
   riskAssessmentDeniesAll:chart.riskAssessment?.patientDeniesAll===true,
   assessmentEvidencePresent:Array.isArray(narriva.assessmentDocumentIds) && narriva.assessmentDocumentIds.length>0},
  service:{code,documentationCode,proBono,allowed,reason,modalityAllowed,durationAllowed:billing.claimable && (!billing.overflowApplied),
   crisisSuggestion:documentationCode==='H0004'?'H2011':documentationCode==='90837' && tier==='intern_plus'?'90839':null}
 };
}
export async function loadNarrivaSource(user,{agencyId,draftId,noteId}, {clinicalDb=clinicalPool}={}) {
 agencyId=positiveId(agencyId);await requireNarrivaAgency(user,agencyId);
 if(!!positiveId(draftId)===!!positiveId(noteId))throw narrivaError(400,'Choose one saved draft or note.');
 let source,output,session={},reviewDocument=null;
 if(draftId) {
  source=await ClinicalNoteDraft.findByIdForUser({draftId,userId:user.id});
  if(!source || Number(source.agency_id)!==agencyId)throw narrivaError(404,'Draft is not available in this workspace.');
  output=parse(decryptNarrivaDraft(source.output_json));
 } else {
  const [[note]]=await clinicalDb.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? AND is_deleted=0',[noteId,agencyId]);
  if(!note)throw narrivaError(404,'Note is not available in this workspace.');
  const meta=parse(note.metadata_json);
  if(meta.restricted || meta.privatePsychotherapyNote)throw narrivaError(403,'Restricted records require their authorized disclosure workflow.');
  const policy=await resolveNoteDocumentationPolicy(note,pool,clinicalDb);
  if(Number(note.created_by_user_id)!==Number(user.id) && Number(note.provider_signed_by_user_id)!==Number(user.id) && Number(policy.supervisorUserId)!==Number(user.id) && !['admin','agency_admin','super_admin'].includes(String(user.role)))throw narrivaError(403,'Only the author or authorized reviewer can review this note.');
  reviewDocument=await loadReviewDocument({agencyId,providerUserId:note.provider_signed_by_user_id || note.created_by_user_id},'note',noteId,clinicalDb);
  source=reviewDocument.row;session=reviewDocument.session || {};output={sections:parse(maybeDecryptNotePayload(source.note_payload)).sections,meta:parse(source.metadata_json)};
  output._narrative=narrivaNarrative(maybeDecryptNotePayload(source.note_payload));
 }
 const client=source.client_id?await requireNarrivaClient(user,agencyId,source.client_id,{authorizedNoteReviewer:!!noteId}):null;
 if(!client)throw narrivaError(409,'Link the note to the correct client and session before compliance review.');
 if(source.clinical_session_id) {
  const [[row]]=await clinicalDb.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?',[source.clinical_session_id,agencyId,source.client_id]);
  if(!row)throw narrivaError(409,'The linked session is unavailable.');
  // Immutable approved content does not supersede a live operational hold.
  assertNoPendingClinicalServiceChange(row);
  if(!Object.keys(session).length)session=row;
 }
 const meta={...parse(output.meta),...(noteId?parse(source.metadata_json):{})};
 const provider=await User.findById(source.user_id || source.created_by_user_id);
 const care=await readStaffCareEligibility(provider.id,agencyId);
 provider.credential=care.credential;provider.role=care.agencyRole;
 const guardians=await ClientGuardian.listForClient(client.id);
 const serviceCode=String(source.service_code || meta.serviceCode || session.service_code || '').trim().toUpperCase();
 const codes=await AgencyMedicalServiceCode.listByAgency(agencyId);
 const serviceRule=codes.find(row=>String(row.service_code || row.serviceCode).toUpperCase()===serviceCode);
 const documentationCode=resolveProBonoDocumentationService({serviceCode,metadata:meta}).serviceCode;
 const documentationServiceRule=codes.find(row=>String(row.service_code || row.serviceCode).toUpperCase()===documentationCode);
 // Verify selected file metadata only. No assessment bytes enter a writing/review model.
 let assessmentManifest=[];
 if(meta.narrivaContext?.assessmentEvidence?.length || meta.narrivaContext?.assessmentDocumentIds?.length) {
  const evidence=await loadNarrivaAssessmentEvidence(user,{agencyId,clientId:client.id,clinicalSessionId:source.clinical_session_id,
   draftId:positiveId(draftId),noteId:positiveId(noteId),assessmentEvidence:meta.narrivaContext?.assessmentEvidence,assessmentDocumentIds:meta.narrivaContext?.assessmentDocumentIds},
   {authorizedNoteReviewer:!!noteId,clinicalDb});
  assessmentManifest=evidence.verifiedManifest;
 }
 const narrative=output._narrative || narrivaNarrative(output);
 const inputText=draftId?decryptNarrivaDraft(source.input_text):'';
 const local=narrivaLocalContext({source,meta,session,provider,serviceRule,documentationServiceRule});
 local.clinical.assessmentEvidencePresent=assessmentManifest.length>0;
 const [[priorRisk]]=await pool.execute(`SELECT MAX(risk_assessment_required) AS required FROM narriva_reviews WHERE agency_id=? AND ((draft_id IS NOT NULL AND draft_id=?) OR (clinical_note_id IS NOT NULL AND clinical_note_id=?) OR (clinical_session_id IS NOT NULL AND clinical_session_id=?))`,[agencyId,positiveId(draftId || meta.draftId),positiveId(noteId),positiveId(source.clinical_session_id)]);
 local.clinical.riskRequiredFromPriorReview=Number(priorRisk?.required)===1;
 const catalog=await resolveAgencySchedulingCatalog({agencyId,credentialTier:care.credentialTier,allServiceCodes:[],eligibleServiceCodes:[]});
 const allowedCodes=new Set(catalog.eligibleServiceCodes.map(row=>row.code));
 local.service.allowed=local.service.allowed && care.canProvideCare && allowedCodes.has(local.service.proBono?documentationCode:serviceCode);
 if(local.service.crisisSuggestion && !allowedCodes.has(local.service.crisisSuggestion))local.service.crisisSuggestion=null;
 const sourceHash=narrivaSourceHash({narrative,inputText,meta,service:local.service,encounter:local.encounter,clinical:{...local.clinical,riskRequiredFromPriorReview:undefined},
  session,assessmentManifest,document:reviewDocument?.content || null,providerQualifications:[provider?.credential,provider?.role],rules:NARRIVA_RULES_VERSION});
 return {agencyId,draftId:positiveId(draftId),noteId:positiveId(noteId),source,meta,session,provider,client,narrative,sourceHash,inputText,...local,
  identifiers:[client.first_name,client.last_name,client.full_name,client.initials,client.email,client.contact_email,client.phone_number,client.contact_phone,...guardians.flatMap(g=>[g.first_name,g.last_name,g.email,g.phone])].filter(Boolean)};
}
