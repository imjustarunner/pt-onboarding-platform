import {isMentalStatusExamComplete} from '../../../frontend/src/utils/noteAidMseCatalog.js';
import pool from '../config/database.js';
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import { maybeDecryptNotePayload, maybeEncryptNotePayload } from './clinicalNoteCrypto.service.js';
import { decryptChatText } from './chatEncryption.service.js';
import { narrivaSourceHash, NARRIVA_RULES_VERSION } from './narrivaReviewPolicy.service.js';

// A selected domain is not an assessment. These are the same three domains as the editor.
export const NARRIVA_RISK_DOMAINS=['Suicidal Ideation','Homicidal Ideation','Self-Harm'];
const id=value=>Number.isSafeInteger(Number(value)) && Number(value)>0?Number(value):null;
const object=value=>{if(typeof value==='string'){try{return JSON.parse(value) || {};}catch{return {};}}return value && typeof value==='object' && !Array.isArray(value)?value:{};};
const failure=()=>Object.assign(new Error('This session requires a completed risk assessment before signing.'),{status:409,code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
const stale=()=>Object.assign(new Error('The saved narrative compliance decision no longer matches this draft and session. Check the current narrative again before attaching the note.'),{status:409,code:'NARRIVA_PREFLIGHT_STALE'});
function decryptDraft(value) {
 const parsed=object(value);
 return parsed.ciphertextB64 && parsed.ivB64?decryptChatText(parsed):maybeDecryptNotePayload(value);
}
export function narrivaDraftEvidenceHash(draft) {
 const output=object(decryptDraft(draft?.output_json));
 // This badge is derived from review results; changing it is not a source edit.
 if(output.meta?.narrivaContext){output.meta={...output.meta,narrivaContext:{...output.meta.narrivaContext}};delete output.meta.narrivaContext.riskAssessmentRequired;}
 return narrivaSourceHash({inputText:decryptDraft(draft?.input_text),output});
}
export function narrivaNoteEvidenceHash(note) {
 const metadata={...object(note?.metadata_json)};
 // Signatures and queue synchronization add evidence without changing the
 // clinical assessment or the provider's previously recorded source decision.
 for(const key of ['attestation','supervisionPolicyAtSignature','supervisorQueue','supervisorCosign','supervisorCosignHistory','treatmentPlanEligibility'])delete metadata[key];
 if(metadata.flags?.missingDiagnosis!==undefined){metadata.flags={...metadata.flags};delete metadata.flags.missingDiagnosis;if(!Object.keys(metadata.flags).length)delete metadata.flags;}
 return narrivaSourceHash({notePayload:maybeDecryptNotePayload(note?.note_payload),metadata});
}
const selected=value=>typeof value==='string' && value.trim().length>0 && !['selected','not assessed','not_assessed','unassessed'].includes(value.trim().toLowerCase());
export function completeNarrivaRiskAssessment(risk) {
 if(!risk || typeof risk!=='object' || Array.isArray(risk))return false;
 if(risk.patientDeniesAll===true)return true;
 if(risk.items && typeof risk.items==='object' && !Array.isArray(risk.items))return NARRIVA_RISK_DOMAINS.every(key=>{
  const item=risk.items[key];return item && (selected(item.option) || selected(item.status));
 });
 // Older notes use named areas; require an actual finding for every safety domain.
 return Array.isArray(risk.areas) && NARRIVA_RISK_DOMAINS.every(name=>risk.areas.some(area=>area?.name===name && (selected(area.option) || selected(area.status) || selected(area.level))));
}
const decisions=review=>[...new Map([
 ...(review.priorDecisions || []),
 ...(review.checks || []).flatMap(check=>(check.findings || []).filter(f=>f.bypassed===true).map(f=>({checkId:check.id,id:f.id,message:f.message,reason:f.bypassReason,bypassedBy:f.bypassedBy,bypassedAt:f.bypassedAt})))
].map(decision=>[`${decision.checkId}:${decision.id}`,decision])).values()];
function riskBypassed(review,authorUserId) {
 const risk=review.checks?.find(check=>check.id==='risk_safety');
 return review.riskAssessmentIncluded!==true && risk?.status==='bypassed' && Array.isArray(risk.findings) && risk.findings.length>0 && risk.findings.every(f=>f.canBypass===true && f.bypassed===true && id(f.bypassedBy)===id(authorUserId) && typeof f.bypassReason==='string' && f.bypassReason.trim().length>0);
}

/** Read the encrypted, latest provider decision; caller-provided booleans are never authority. */
export async function verifiedNarrivaPreflight({draft,session,authorUserId,evidence},{database=pool,allowCurrentOutput=false}={}) {
 if(!draft || !id(authorUserId) || !id(session?.id)
  || id(draft.user_id)!==id(authorUserId) || id(draft.agency_id)!==id(session.agency_id)
  || id(draft.client_id)!==id(session.client_id) || id(draft.clinical_session_id)!==id(session.id))throw stale();
 const [rows]=await database.execute(`SELECT * FROM narriva_reviews WHERE agency_id=? AND draft_id=? AND actor_user_id=? AND clinical_note_id IS NULL ORDER BY id DESC LIMIT 1`,[session.agency_id,draft.id,authorUserId]);
 const row=rows?.[0];
 if(!row && !evidence?.reviewId)return null;
 let review;try{review=object(maybeDecryptNotePayload(row?.result_encrypted));}catch{throw stale();}
 const currentOutput=allowCurrentOutput && review.phase==='output';
 if(!row || !currentOutput && id(row.id)!==id(evidence?.reviewId) || id(row.agency_id)!==id(session.agency_id)
  || id(row.draft_id)!==id(draft.id) || id(row.actor_user_id)!==id(authorUserId)
  || id(row.clinical_session_id)!==id(session.id) || row.clinical_note_id
  || !['passed','bypassed'].includes(row.status))throw stale();
 const inputHash=narrivaSourceHash(decryptDraft(draft.input_text));
 if(!['pre_generation','output'].includes(review.phase) || review.rulesVersion!==NARRIVA_RULES_VERSION
  || !['passed','bypassed'].includes(review.status) || id(review.clientId)!==id(session.client_id)
  || id(review.clinicalSessionId)!==id(session.id) || id(review.actorUserId)!==id(authorUserId)
  || id(review.draftId)!==id(draft.id) || review.sourceHash!==row.source_hash
  || !currentOutput && (review.sourceHash!==evidence?.sourceHash || review.inputHash!==evidence?.inputHash)
  || review.inputHash!==inputHash
  || review.phase==='output' && review.draftEvidenceHash!==narrivaDraftEvidenceHash(draft))throw stale();
 const kept=decisions(review);
 return {reviewId:id(row.id),phase:review.phase,draftEvidenceHash:review.draftEvidenceHash || null,sourceHash:row.source_hash,inputHash,keptAsIs:kept.length>0,decisions:kept,
  riskAssessmentIncluded:review.riskAssessmentIncluded===true,riskBypassed:riskBypassed(review,authorUserId)};
}
function evidenceHash(notePayload,metadata) {
 return narrivaSourceHash({notePayload:maybeDecryptNotePayload(notePayload),narrivaPreflight:metadata.narrivaPreflight,
  riskAssessmentIncluded:metadata.narrivaContext?.riskAssessmentIncluded===true,
  riskAssessmentRequired:metadata.narrivaContext?.riskAssessmentRequired===true});
}

/** Only this server path can bind a verified provider decision to an attached note. */
export async function protectNarrivaPreflightMetadata({metadata,draft,session,authorUserId,notePayload},{database=pool}={}) {
 const clean={...object(metadata)};
 delete clean.narrivaPreflight;delete clean.narrivaPreflightBinding;delete clean.narrivaSupervisorFlags;
 if(!draft)return clean;
 const saved=object(decryptDraft(draft?.output_json));
 const evidence=saved.meta?.narrivaPreflight;
 // Sessionless chart-action drafts acquire their note-only session on attach.
 // They carry no session compliance attestation to transfer.
 if(!id(draft.clinical_session_id) && !evidence?.reviewId)return clean;
 const verified=await verifiedNarrivaPreflight({draft,session,authorUserId,evidence},{database,allowCurrentOutput:true});
 if(!verified)return clean;
 clean.narrivaPreflight={phase:verified.phase,reviewId:verified.reviewId,sourceHash:verified.sourceHash,inputHash:verified.inputHash,keptAsIs:verified.keptAsIs,decisions:verified.decisions};
 if(verified.keptAsIs){
  clean.quickSignEligible=false;
  clean.narrivaSupervisorFlags=verified.decisions.map(decision=>({category:decision.checkId==='risk_safety'?'risk':'documentation',...decision,reviewId:verified.reviewId}));
 }
 const claim={v:1,agencyId:id(session.agency_id),clientId:id(session.client_id),clinicalSessionId:id(session.id),authorUserId:id(authorUserId),draftId:id(draft.id),
  ...verified,riskAssessmentIncluded:verified.riskAssessmentIncluded || saved.meta?.narrivaContext?.riskAssessmentIncluded===true || clean.narrivaContext?.riskAssessmentIncluded===true,
  evidenceHash:evidenceHash(notePayload,clean)};
 clean.narrivaPreflightBinding=maybeEncryptNotePayload(JSON.stringify(claim));
 return clean;
}
async function boundReviewEvidence(note,metadata,claim,{database,drafts}) {
 if(!note.provider_signed_at) {
  const draft=await drafts.findByIdForUser({draftId:claim.draftId,userId:claim.authorUserId});
  return verifiedNarrivaPreflight({draft,session:{id:note.clinical_session_id,agency_id:note.agency_id,client_id:note.client_id},authorUserId:note.created_by_user_id,evidence:metadata.narrivaPreflight},{database});
 }
 // Working drafts may be retired after signature. The encrypted binding stays
 // with the immutable note and must still match its original persisted review.
 const [[row]]=await database.execute('SELECT * FROM narriva_reviews WHERE id=? AND agency_id=? AND actor_user_id=? AND draft_id=?',[claim.reviewId,note.agency_id,note.created_by_user_id,claim.draftId]);
 if(!row || id(row.id)!==id(claim.reviewId) || id(row.agency_id)!==id(note.agency_id) || id(row.actor_user_id)!==id(note.created_by_user_id)
  || id(row.draft_id)!==id(claim.draftId) || row.clinical_note_id || id(row.clinical_session_id)!==id(note.clinical_session_id)
  || !['passed','bypassed'].includes(row.status) || row.source_hash!==claim.sourceHash)return null;
 const review=object(maybeDecryptNotePayload(row.result_encrypted));
 if(!['pre_generation','output'].includes(review.phase) || !['passed','bypassed'].includes(review.status) || review.rulesVersion!==NARRIVA_RULES_VERSION
  || id(review.actorUserId)!==id(note.created_by_user_id) || id(review.draftId)!==id(claim.draftId) || id(review.clientId)!==id(note.client_id)
  || id(review.clinicalSessionId)!==id(note.clinical_session_id) || review.sourceHash!==claim.sourceHash || review.inputHash!==claim.inputHash
  || review.phase==='output' && review.draftEvidenceHash!==claim.draftEvidenceHash)return null;
 const [[later]]=await database.execute(`SELECT id FROM narriva_reviews WHERE agency_id=? AND id>? AND risk_assessment_required=1 AND ((clinical_note_id IS NOT NULL AND clinical_note_id=?) OR (draft_id IS NOT NULL AND draft_id=?) OR (clinical_session_id IS NOT NULL AND clinical_session_id=?)) LIMIT 1`,[note.agency_id,row.id,note.id,claim.draftId,note.clinical_session_id]);
 if(later)return null;
 const kept=decisions(review);
 return {reviewId:id(row.id),sourceHash:row.source_hash,inputHash:review.inputHash,decisions:kept,riskBypassed:riskBypassed(review,note.created_by_user_id)};
}
/** Supervisor flags are display data. Only this verified binding grants inheritance. */
export async function verifiedBoundNarrivaDecisions(note,{database=pool,drafts=ClinicalNoteDraft}={}) {
 const metadata=object(note.metadata_json);
 if(object(metadata.narrivaPreflightBinding)._enc!==true)return [];
 try {
  const claim=object(maybeDecryptNotePayload(metadata.narrivaPreflightBinding));
  if(claim.v!==1 || !['agencyId','clientId','clinicalSessionId','authorUserId','draftId'].every(key=>id(claim[key]))
   || id(claim.agencyId)!==id(note.agency_id) || id(claim.clientId)!==id(note.client_id)
   || id(claim.clinicalSessionId)!==id(note.clinical_session_id) || id(claim.authorUserId)!==id(note.created_by_user_id)
   || id(claim.draftId)!==id(metadata.draftId) || claim.evidenceHash!==evidenceHash(note.note_payload,metadata))return [];
  const verified=await boundReviewEvidence(note,metadata,claim,{database,drafts});
  if(!verified || verified.reviewId!==claim.reviewId || verified.sourceHash!==claim.sourceHash || verified.inputHash!==claim.inputHash)return [];
  return verified.decisions.filter(decision=>id(decision.bypassedBy)===id(note.created_by_user_id) && typeof decision.reason==='string' && decision.reason.trim());
 }catch{return [];}
}
async function verifiedRiskBypass(note,metadata,{database=pool,drafts=ClinicalNoteDraft}={}) {
 // An encrypted envelope is required here; legacy plaintext is never an attestation.
 if(object(metadata.narrivaPreflightBinding)._enc!==true)return false;
 try{
  const claim=object(maybeDecryptNotePayload(metadata.narrivaPreflightBinding));
  if(claim.v!==1 || !['agencyId','clientId','clinicalSessionId','authorUserId','draftId'].every(key=>id(claim[key]))
   || id(claim.agencyId)!==id(note.agency_id) || id(claim.clientId)!==id(note.client_id)
   || id(claim.clinicalSessionId)!==id(note.clinical_session_id) || id(claim.authorUserId)!==id(note.created_by_user_id)
   || id(claim.draftId)!==id(metadata.draftId) || claim.evidenceHash!==evidenceHash(note.note_payload,metadata)
   || claim.riskAssessmentIncluded===true)return false;
  const verified=await boundReviewEvidence(note,metadata,claim,{database,drafts});
  if(!verified?.riskBypassed || verified.reviewId!==claim.reviewId || verified.sourceHash!==claim.sourceHash || verified.inputHash!==claim.inputHash)return false;
  // A later unresolved risk detection cannot be erased by replaying this decision.
  const [[later]]=await database.execute(`SELECT id FROM narriva_reviews WHERE agency_id=? AND id>? AND risk_assessment_required=1 AND ((clinical_note_id IS NOT NULL AND clinical_note_id=?) OR (draft_id IS NOT NULL AND draft_id=?) OR (clinical_session_id IS NOT NULL AND clinical_session_id=?)) LIMIT 1`,[note.agency_id,verified.reviewId,note.id,claim.draftId,note.clinical_session_id]);
  return !later;
 }catch{return false;}
}
async function verifiedNoteRiskBypass(note,{database=pool}={}) {
 if(!id(note.id) || !id(note.agency_id) || !id(note.client_id) || !id(note.clinical_session_id) || !id(note.created_by_user_id))return false;
 try {
  const [[row]]=await database.execute('SELECT * FROM narriva_reviews WHERE agency_id=? AND clinical_note_id=? AND actor_user_id=? ORDER BY id DESC LIMIT 1',[note.agency_id,note.id,note.created_by_user_id]);
  if(!row || id(row.agency_id)!==id(note.agency_id) || id(row.clinical_note_id)!==id(note.id)
   || id(row.clinical_session_id)!==id(note.clinical_session_id) || id(row.actor_user_id)!==id(note.created_by_user_id)
   || !['passed','bypassed'].includes(row.status))return false;
  const review=object(maybeDecryptNotePayload(row.result_encrypted));
  if(review.phase!=='output' || review.rulesVersion!==NARRIVA_RULES_VERSION || !['passed','bypassed'].includes(review.status)
   || id(review.noteId)!==id(note.id) || id(review.clientId)!==id(note.client_id)
   || id(review.clinicalSessionId)!==id(note.clinical_session_id) || id(review.actorUserId)!==id(note.created_by_user_id)
   || review.sourceHash!==row.source_hash || review.noteEvidenceHash!==narrivaNoteEvidenceHash(note)
   || !riskBypassed(review,note.created_by_user_id))return false;
  const [[later]]=await database.execute(`SELECT id FROM narriva_reviews WHERE agency_id=? AND id>? AND risk_assessment_required=1 AND ((clinical_note_id IS NOT NULL AND clinical_note_id=?) OR (draft_id IS NOT NULL AND draft_id=?) OR (clinical_session_id IS NOT NULL AND clinical_session_id=?)) LIMIT 1`,[note.agency_id,row.id,note.id,id(object(note.metadata_json).draftId),note.clinical_session_id]);
  return !later;
 }catch{return false;}
}
export async function assertNarrivaRiskBeforeSignature(note,dependencies={}) {
 const database=dependencies.database || pool,meta=object(note.metadata_json);
 const clinicalCode=String(meta.underlyingServiceCode || meta.narrivaContext?.underlyingServiceCode || note.service_code || meta.serviceCode || '').toUpperCase();
 if (!note.provider_signed_at && meta.narrivaContext?.writerMode==='narriva' && /^9\d{4}$/.test(clinicalCode)
     && !isMentalStatusExamComplete(meta.structuredChart?.mentalStatusExam)) {
  throw Object.assign(new Error('Complete the mental status exam before signing this note.'),{status:409,code:'NARRIVA_MSE_REQUIRED'});
 }
 const [[risk]]=await database.execute(`SELECT MAX(risk_assessment_required) AS required FROM narriva_reviews WHERE agency_id=? AND ((clinical_note_id IS NOT NULL AND clinical_note_id=?) OR (draft_id IS NOT NULL AND draft_id=?) OR (clinical_session_id IS NOT NULL AND clinical_session_id=?))`,[note.agency_id,note.id,id(meta.draftId),id(note.clinical_session_id)]);
 const explicitlyIncluded=meta.narrivaContext?.riskAssessmentIncluded===true;
 if(Number(risk?.required)!==1 && !explicitlyIncluded && meta.narrivaContext?.riskAssessmentRequired!==true)return;
 if(meta.narrivaContext?.riskAssessmentCompleted===true && completeNarrivaRiskAssessment(meta.structuredChart?.riskAssessment))return;
 if(!explicitlyIncluded && (await verifiedNoteRiskBypass(note,{database}) || await verifiedRiskBypass(note,meta,{...dependencies,database})))return;
 throw failure();
}
