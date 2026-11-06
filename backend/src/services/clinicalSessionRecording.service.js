import {createHash,randomUUID} from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import Appointment from '../models/Appointment.model.js';
import SessionRecording from '../models/SessionRecording.model.js';
import SessionRecordingConsent from '../models/SessionRecordingConsent.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import StorageService from './storage.service.js';
import TaskAssignmentService from './taskAssignment.service.js';
import {requireStaffCareEligibility} from './staffCareEligibility.service.js';
import {requireNarrivaAgency} from './narrivaAccess.service.js';
import {clinicalAccess,ageOn} from './guardianClinicalAccess.service.js';
import {listClientAgencyMembershipIds} from '../utils/noteAidClientAgency.js';
import {maybeEncryptNotePayload,maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {decryptGuardianIntake} from './guardianIntakeEncryption.service.js';
import {documentHash,validateAgreementSignature,saveRecordingAgreementPdf,renderRecordingAgreement} from './recordingAgreementDocument.service.js';
import {attachSignedPdfToClient} from './phiDocumentAttachment.service.js';
import {requireSessionPrivacyConfiguration} from './sessionAiPrivacy.service.js';
import {transcribeLongAudio} from './speechTranscription.service.js';
import {summarizeSessionRecording} from './sessionRecordingSummary.service.js';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const id=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
const decrypt=value=>value?maybeDecryptNotePayload(value):'';
const parse=value=>{try{return typeof value==='object'?value:JSON.parse(value||'{}');}catch{return {};}};
const name=client=>client.full_name||[client.first_name,client.last_name].filter(Boolean).join(' ')||client.initials||'Client';
// Only the completed-narrative reader below can use this private mode. Request
// flags never change capture or consent authorization.
const COMPLETED_NARRATIVE_READ=Symbol('completed narrative read');
export function consentProof(participant,onFile=null) {
  if(participant.revoked_at)return false;
  if(participant.legacy_consent_id&&!onFile)return false;
  return !!(onFile || (participant.signed_at&&participant.document_hash&&participant.signature_encrypted&&participant.signed_pdf_path));
}
export function assertRecordingReady(recording,participants) {
  if(!participants.length||participants.some(p=>p.required_signature&&!p.consented))throw fail('Every required recorded participant needs an executed waiver before capture.');
  if(Number(recording.confirmed_revision)!==Number(recording.recording_revision)||!recording.confirmed_at)throw fail('Confirm this session’s participants and recording consent before capture.');
  if(recording.capture_paused||recording.status!=='recording')throw fail('Recording is paused or stopped.');
}
/** Retired clinical capture routes cannot bypass the session waiver ledger. */
export async function assertLegacyClinicalCaptureDisabled(recording) {
  const client=recording.client_id?await Client.findById(recording.client_id):null;
  if(recording.session_context_key||recording.session_kind==='clinical'||(recording.client_id&&!['learning','tutoring'].includes(String(client?.client_type||'').toLowerCase())))throw fail('Clinical recording has moved to the actual session. Open Record session from its appointment to review all participant waivers and confirm consent.',409);
}
export async function resolveRecordingSession(user,input) {
  return resolveRecordingContext(user,input);
}
async function resolveRecordingContext(user,input,accessMode=null) {
  const agencyId=id(input.agencyId),clientId=id(input.clientId),userId=id(user?.id);
  if(!agencyId||!clientId||!userId)throw fail('A client, workspace and signed-in provider are required.',400);
  await requireNarrivaAgency(user,agencyId);
  await requireStaffCareEligibility(userId,agencyId);
  const [[membership]]=await pool.execute('SELECT ua.user_id,a.feature_flags FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id WHERE ua.user_id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND a.is_active=1',[userId,agencyId]);
  if(!membership)throw fail('An active relationship with this workspace is required.',403);
  if(accessMode!==COMPLETED_NARRATIVE_READ&&parse(parse(membership.feature_flags)?.narriva)?.recording!==true)throw fail('Session recording is disabled for this workspace.',403);
  const client=await Client.findById(clientId,{includeSensitive:true});
  if(!client||!(await listClientAgencyMembershipIds(clientId)).includes(agencyId))throw fail('Client not found in this workspace.',404);
  let clinical=null,office=null,appointment=null;
  if(id(input.clinicalSessionId))clinical=await ClinicalSession.findById(id(input.clinicalSessionId));
  if(input.clinicalSessionId&&(!clinical||Number(clinical.agency_id)!==agencyId||Number(clinical.client_id)!==clientId||Number(clinical.provider_user_id)!==userId))throw fail('Open your own actual client session from the schedule.',403);
  const officeId=id(input.officeEventId)||id(clinical?.office_event_id);
  if(officeId){
    const [rows]=await pool.execute(`SELECT e.*,l.agency_id AS office_agency_id FROM office_events e JOIN office_locations l ON l.id=e.office_location_id WHERE e.id=?`,[officeId]);office=rows[0];
    if(!office||Number(office.booked_provider_id||office.assigned_provider_id)!==userId)throw fail('The office session is not assigned to you.',403);
    if(Number(office.office_agency_id)!==agencyId){const [shared]=await pool.execute('SELECT 1 FROM office_location_agencies WHERE office_location_id=? AND agency_id=?',[office.office_location_id,agencyId]);if(!shared.length)throw fail('This office session is in another workspace.',403);}
    if(clinical&&Number(clinical.office_event_id)!==officeId)throw fail('Session and appointment do not match.');
    appointment=await Appointment.findByOfficeEventId(officeId);
  }else if(clinical?.appointment_id)appointment=await Appointment.findById(clinical.appointment_id);
  if(!clinical&&!office)throw fail('Open an actual scheduled clinical or office session before recording.',400);
  if(clinical&&!clinical.office_event_id&&!clinical.appointment_id&&!clinical.billing_encounter_id)throw fail('This note draft is not a scheduled session. Open its appointment.',400);
  if(['cancelled','canceled','voided','no_show','missed'].includes(String(clinical?.encounter_status||office?.status||'').toLowerCase()))throw fail('This session is not available for recording.');
  const scheduled=appointment?await Appointment.listParticipants(appointment.id):[];
  if(appointment&&(Number(appointment.agencyId)!==agencyId||Number(appointment.providerUserId)!==userId||!scheduled.some(p=>Number(p.clientId)===clientId)))throw fail('The appointment client, workspace or provider changed. Reopen the current session.',403);
  if(!clinical&&Number(office.client_id)!==clientId&&!scheduled.some(p=>Number(p.clientId)===clientId))throw fail('This client is not in that office appointment.',403);
  const key=office?`office:${office.id}:client:${clientId}`:`clinical:${clinical.id}`;
  const required=[{key:`client:${clientId}`,clientId,type:'client',displayName:name(client)}];
  for(const p of scheduled){
    if(Number(p.userId)===userId||Number(p.clientId)===clientId||['payer','billing_responsible'].includes(p.role))continue;
    if(p.clientId){const c=await Client.findById(p.clientId,{includeSensitive:true});if(!c||!(await listClientAgencyMembershipIds(c.id)).includes(agencyId))throw fail('A scheduled participant’s workspace relationship needs review.',403);required.push({key:`client:${c.id}`,clientId:c.id,type:'client',displayName:name(c)});}
    else required.push({key:`appointment:${p.id}`,type:'adult',displayName:p.displayName||'Scheduled participant',userId:p.userId||null});
  }
  return {agencyId,clientId,userId,key,client,clinical,office,appointment,required,
    serviceCode:clinical?.service_code||appointment?.serviceCode||office?.service_code||null,
    startAt:clinical?.scheduled_start_at||office?.start_at||appointment?.startAt||null};
}
async function templatesFor(agencyId){const [rows]=await pool.execute("SELECT id,name,version,template_type FROM document_templates WHERE (agency_id=? OR agency_id IS NULL) AND document_type='audio_recording_consent' AND is_active=1 ORDER BY name",[agencyId]);return rows;}
async function verifiedSigners(context,clientId=context.clientId) {
  const links=await ClientGuardian.listForClient(clientId),allowed=[];
  for(const link of links){
    if(Number(link.access_enabled)!==1||Number(link.is_active)!==1||!['ACTIVE','ACTIVE_EMPLOYEE'].includes(link.status))continue;
    const access=await clinicalAccess({agencyId:context.agencyId,clientId,userId:link.guardian_user_id});
    if(!access.scopes.includes('clinical_documents')||access.reviewRequired)continue;
    allowed.push({userId:Number(link.guardian_user_id),name:[link.first_name,link.last_name].filter(Boolean).join(' '),relationship:link.relationship_type==='self'?'self':'legal_guardian'});
  }
  return allowed;
}
export async function recordingForUser(user,recordingId) {
  return loadRecordingForUser(user,recordingId);
}
async function loadRecordingForUser(user,recordingId,accessMode=null) {
  const recording=await SessionRecording.findByIdForUser({id:recordingId,userId:user.id});
  if(!recording?.session_context_key)throw fail('Session recording not found.',404);
  if(accessMode===COMPLETED_NARRATIVE_READ&&(recording.status!=='completed'||!recording.summary_text))throw fail('This session narrative is not ready. Return to its recorder and finish processing.');
  const context=await resolveRecordingContext(user,{agencyId:recording.agency_id,clientId:recording.client_id,clinicalSessionId:recording.clinical_session_id,officeEventId:recording.office_event_id},accessMode);
  if(context.key!==recording.session_context_key)throw fail('The session changed. Reopen it before recording.');
  return {recording,context};
}
function consentSignatureEvidence(value) {
  try {
    const envelope=typeof value==='object'?value:JSON.parse(value||'{}');
    if(envelope?._enc)return parse(maybeDecryptNotePayload(JSON.stringify(envelope)));
    if(envelope?.ciphertextB64)return parse(decryptGuardianIntake(envelope));
    return envelope;
  } catch {return null;}
}
async function currentOnFileConsent(context,clientId) {
  const consent=await SessionRecordingConsent.findOnFile({agencyId:context.agencyId,clientId});
  if(!consent)return null;
  const template=consent.document_template_id?await DocumentTemplate.findById(consent.document_template_id):null;
  if(!template?.is_active||template.document_type!=='audio_recording_consent'||(template.agency_id&&Number(template.agency_id)!==context.agencyId))return null;
  let signedVersion=parse(consent.document_json).version,portalSignerId=null;
  if(consent.signed_document_id){const [[signed]]=await pool.execute('SELECT template_version,user_id FROM signed_documents WHERE id=? AND task_id=? AND document_template_id=? AND pdf_hash IS NOT NULL',[consent.signed_document_id,consent.task_id,template.id]);signedVersion=signedVersion||signed?.template_version;portalSignerId=signed?.user_id;}
  if(Number(signedVersion)!==Number(template.version||1))return null;
  const signature=consentSignatureEvidence(consent.signature_json),signerId=id(signature?.verifiedSignerUserId||signature?.userId||portalSignerId);
  const subject=await Client.findById(clientId,{includeSensitive:true}),subjectAge=subject?.date_of_birth?ageOn(subject.date_of_birth):null;
  if(subjectAge===null)return null;
  if(signerId){
    const signer=(await verifiedSigners(context,clientId)).find(s=>s.userId===signerId);
    if(!signer||signer.userId===context.userId||(subjectAge<18&&signer.relationship==='self'))return null;
  }else{
    const normalize=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
    if(subjectAge<18||signature?.relationship!=='self'||normalize(signature?.name)!==normalize(name(subject)))return null;
  }
  return consent;
}
async function currentParticipants(recording,context,{syncPortal=true}={}) {
  const [rows]=await pool.execute('SELECT * FROM session_recording_participants WHERE session_recording_id=? AND is_active=1 ORDER BY id',[recording.id]);
  for(const row of rows){
    if(syncPortal&&row.task_id&&!row.signed_at&&!row.revoked_at){
      // The actual named portal signer and current template version must match.
      const [[signed]]=await pool.execute('SELECT * FROM signed_documents WHERE task_id=? AND user_id=? AND document_template_id=? AND signed_pdf_path IS NOT NULL AND pdf_hash IS NOT NULL AND template_version=? ORDER BY id DESC LIMIT 1',[row.task_id,row.signer_user_id,row.document_template_id,parse(decrypt(row.document_encrypted)).version]);
      if(signed){
        const signer=(await verifiedSigners(context,row.client_id||context.clientId)).find(s=>s.userId===Number(row.signer_user_id));
        if(signer){
          const attached=await attachSignedPdfToClient({clientId:row.client_id||context.clientId,storagePath:signed.signed_pdf_path,originalName:'audio-recording-consent.pdf',documentTitle:'Audio Recording Consent',documentType:'audio_recording_consent',mimeType:'application/pdf',uploadedByUserId:context.userId,agencyIdOverride:context.agencyId,callerLabel:'session_recording_portal_consent',auditMetadata:{source:'session_recording',recordingId:recording.id,participantId:row.id}});
          if(attached?.ok){
            let legacyId=null;
            const subject=row.client_id?await Client.findById(row.client_id,{includeSensitive:true}):null;
            if(subject?.date_of_birth){const consent=await SessionRecordingConsent.create({agencyId:context.agencyId,clientId:subject.id,sessionRecordingId:recording.id,signerFullName:name(subject),signerDob:subject.date_of_birth,matchedBy:'client_id',documentTemplateId:row.document_template_id,taskId:row.task_id,signedDocumentId:signed.id,signedAt:signed.signed_at,createdByUserId:context.userId});legacyId=consent.id;}
            await pool.execute('UPDATE session_recording_participants SET signed_at=?,signed_pdf_path=?,signed_document_id=?,signature_encrypted=?,legacy_consent_id=? WHERE id=?',[signed.signed_at,signed.signed_pdf_path,signed.id,maybeEncryptNotePayload(JSON.stringify({portalSignerUserId:signer.userId,relationship:signer.relationship,pdfHash:signed.pdf_hash})),legacyId,row.id]);Object.assign(row,{signed_at:signed.signed_at,signed_pdf_path:signed.signed_pdf_path,signature_encrypted:'verified',legacy_consent_id:legacyId});
          }
        }
      }
    }
    let onFile=null;
    if(row.client_id&&!row.revoked_at)onFile=await currentOnFileConsent(context,row.client_id);
    // A known scheduled participant cannot silently disappear while capture continues.
    row.consented=consentProof(row,onFile);
    if(row.document_template_id&&row.signed_at){const currentTemplate=await DocumentTemplate.findById(row.document_template_id);const signedVersion=parse(decrypt(row.document_encrypted)).version;if(!currentTemplate?.is_active||Number(currentTemplate.version||1)!==Number(signedVersion))row.consented=false;}
    if((row.signed_document_id||row.signer_user_id)&&!(await verifiedSigners(context,row.client_id||context.clientId)).some(s=>s.userId===Number(row.signer_user_id)))row.consented=false;
    row.effectiveConsentId=onFile?.id||row.legacy_consent_id||null;
    row.displayName=decrypt(row.name_encrypted);
    if(row.client_id){const subject=await Client.findById(row.client_id,{includeSensitive:true});row.requiresGuardian=subject?.date_of_birth?ageOn(subject.date_of_birth)<18:true;row.signers=await verifiedSigners(context,row.client_id);}
    else row.requiresGuardian=row.participant_type==='minor';
  }
  return rows;
}
function publicParticipant(row){return {id:Number(row.id),key:row.participant_key,clientId:row.client_id||null,type:row.participant_type,name:row.displayName,required:!!row.required_signature,consented:row.consented,signedAt:row.signed_at||null,taskPending:!!row.task_id&&!row.consented,canRemove:row.participant_key.startsWith('additional:'),requiresGuardian:!!row.requiresGuardian,signers:row.signers||[]};}
export async function sessionRecordingState(user,input) {
  const context=await resolveRecordingSession(user,input);
  const [rows]=await pool.execute('SELECT id FROM session_recordings WHERE agency_id=? AND created_by_user_id=? AND session_context_key=?',[context.agencyId,context.userId,context.key]);
  let recording=rows.length?await SessionRecording.findById(rows[0].id):null;
  let participants=recording?await currentParticipants(recording,context):context.required.map((p,i)=>({id:null,participant_key:p.key,client_id:p.clientId,participant_type:p.type,displayName:p.displayName,required_signature:1,consented:false}));
  let participantReviewNeeded=false;
  if(recording){
    const missing=context.required.some(p=>!participants.some(r=>r.participant_key===p.key));
    participantReviewNeeded=missing;
    if(missing&&(!recording.capture_paused||recording.confirmed_at)){await invalidate(recording.id);recording=await SessionRecording.findById(recording.id);}
  }
  let configured=true;try{requireSessionPrivacyConfiguration();if(!(process.env.CLINICAL_AUDIO_BUCKET||process.env.PTONBOARDFILES))configured=false;}catch{configured=false;}
  return {context:{agencyId:context.agencyId,clientId:context.clientId,clinicalSessionId:context.clinical?.id||null,officeEventId:context.office?.id||null,serviceCode:context.serviceCode,startAt:context.startAt},
    recording:recording?{id:recording.id,status:recording.status,paused:!!recording.capture_paused,revision:Number(recording.recording_revision),confirmed:recording.confirmed_at&&Number(recording.confirmed_revision)===Number(recording.recording_revision),narrative:decrypt(recording.summary_text)}:null,
    participantReviewNeeded,participants:participants.map(publicParticipant),signers:await verifiedSigners(context),templates:await templatesFor(context.agencyId),configured,
    ready:!participantReviewNeeded&&configured&&!!recording&&participants.length>0&&participants.every(p=>p.consented)&&!!recording.confirmed_at&&Number(recording.confirmed_revision)===Number(recording.recording_revision)};
}
async function invalidate(recordingId,db=pool){await db.execute('UPDATE session_recordings SET capture_paused=1,recording_revision=recording_revision+1,confirmed_revision=NULL,confirmed_at=NULL WHERE id=?',[recordingId]);}
export async function setupSessionRecording(user,input) {
  const context=await resolveRecordingSession(user,input);
  let [rows]=await pool.execute('SELECT id FROM session_recordings WHERE agency_id=? AND created_by_user_id=? AND session_context_key=?',[context.agencyId,context.userId,context.key]);
  let recording;
  if(rows.length)recording=await SessionRecording.findById(rows[0].id);
  else{
    // INSERT ... duplicate detection serializes setup for this actual encounter.
    const [inserted]=await pool.execute(`INSERT INTO session_recordings (agency_id,created_by_user_id,client_id,office_event_id,clinical_session_id,session_context_key,session_kind,status,service_code,auto_transcribe,capture_paused) VALUES (?,?,?,?,?,?,'clinical','setup',?,1,1) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,[context.agencyId,context.userId,context.clientId,context.office?.id||null,context.clinical?.id||null,context.key,context.serviceCode]);recording=await SessionRecording.findById(inserted.insertId);
  }
  for(const p of context.required){await pool.execute('INSERT IGNORE INTO session_recording_participants (session_recording_id,participant_key,client_id,participant_type,name_encrypted,required_signature,signer_user_id) VALUES (?,?,?,?,?,1,?)',[recording.id,p.key,p.clientId||null,p.type,maybeEncryptNotePayload(p.displayName),p.userId||null]);}
  return sessionRecordingState(user,input);
}
export async function changeRecordingParticipants(user,recordingId,input) {
  const {recording,context}=await recordingForUser(user,recordingId);
  if(recording.status==='processing')throw fail('Wait for transcript processing before changing participants.');
  const removeId=id(input.removeParticipantId);
  if(removeId){const [rows]=await pool.execute('SELECT participant_key FROM session_recording_participants WHERE id=? AND session_recording_id=?',[removeId,recording.id]);if(!rows[0]?.participant_key.startsWith('additional:'))throw fail('Scheduled participants cannot be removed from recording consent. Update the actual appointment first.',400);await pool.execute('UPDATE session_recording_participants SET is_active=0 WHERE id=?',[removeId]);}
  else{if(input.type==='minor')throw fail('Add the minor to the actual session and verify their guardian authority on the client record before recording.',400);const displayName=String(input.name||'').trim();if(!displayName||displayName.length>255||!['adult','minor'].includes(input.type))throw fail('Enter the participant’s name and choose adult or minor.',400);await pool.execute('INSERT INTO session_recording_participants (session_recording_id,participant_key,participant_type,name_encrypted,required_signature) VALUES (?,?,?,?,1)',[recording.id,`additional:${randomUUID()}`,input.type,maybeEncryptNotePayload(displayName)]);}
  await invalidate(recording.id);return sessionRecordingState(user,{agencyId:context.agencyId,clientId:context.clientId,clinicalSessionId:context.clinical?.id,officeEventId:context.office?.id});
}
async function participantFor(recording,idValue){const [[row]]=await pool.execute('SELECT * FROM session_recording_participants WHERE id=? AND session_recording_id=? AND is_active=1',[id(idValue),recording.id]);if(!row)throw fail('Participant not found.',404);return row;}
export async function prepareRecordingConsent(user,recordingId,input) {
  const {recording,context}=await recordingForUser(user,recordingId),participant=await participantFor(recording,input.participantId);
  const template=await DocumentTemplate.findById(id(input.templateId));
  if(!template||!template.is_active||template.document_type!=='audio_recording_consent'||(template.agency_id&&Number(template.agency_id)!==context.agencyId))throw fail('Choose a current recording waiver for this workspace.',400);
  const [[agency]]=await pool.execute('SELECT name FROM agencies WHERE id=?',[context.agencyId]);
  const document={title:template.name,version:template.version||1,templateId:template.id,templateType:template.template_type,agencyName:agency.name,parties:[{role:'Recorded participant',name:decrypt(participant.name_encrypted)}],text:'Recording is optional. The signed waiver below applies to this participant.'};
  if(template.template_type==='pdf'){document.templatePath=template.file_path;document.templateHash=createHash('sha256').update(await StorageService.readObject(template.file_path)).digest('hex');}
  else{document.html=sanitizeHtml(template.html_content||'',{allowedTags:sanitizeHtml.defaults.allowedTags.concat(['h1','h2'])});if(!document.html.trim())throw fail('Choose a complete recording waiver; this template is empty.',400);}
  await pool.execute('UPDATE session_recording_participants SET document_template_id=?,document_hash=?,document_encrypted=?,signature_encrypted=NULL,signed_at=NULL,signed_pdf_path=NULL,revoked_at=NULL,task_id=NULL,signed_document_id=NULL,signer_user_id=NULL WHERE id=?',[template.id,documentHash(document),maybeEncryptNotePayload(JSON.stringify(document)),participant.id]);await invalidate(recording.id);
  return {participantId:Number(participant.id),documentHash:documentHash(document),html:renderRecordingAgreement(document),templateType:document.templateType,signers:participant.client_id?await verifiedSigners(context,participant.client_id):[]};
}
export async function recordingConsentPdf(user,recordingId,participantId) {const {recording}=await recordingForUser(user,recordingId),p=await participantFor(recording,participantId),doc=parse(decrypt(p.document_encrypted));if(doc.templateType!=='pdf')throw fail('PDF not found.',404);return StorageService.readObject(doc.templatePath);}
export async function signRecordingConsent(user,recordingId,participantId,input,evidence={}) {
  const {recording,context}=await recordingForUser(user,recordingId),p=await participantFor(recording,participantId),document=parse(decrypt(p.document_encrypted));
  if(!p.document_hash||input.documentHash!==p.document_hash||documentHash(document)!==p.document_hash)throw fail('Review the current waiver before signing.');
  const currentTemplate=await DocumentTemplate.findById(p.document_template_id);
  if(!currentTemplate?.is_active||Number(currentTemplate.version||1)!==Number(document.version))throw fail('The waiver template changed. Open and review the current waiver again.');
  if(input.presentedByClinician!==true||input.signerPresent!==true||input.authorityConfirmed!==true)throw fail('The signer must review and personally sign this waiver; confirm their identity and authority.',400);
  let signerName=String(input.signerName||'').trim();const relationship=String(input.relationship||'');
  if(!signerName||signerName.length>255||!['self','parent','legal_guardian'].includes(relationship))throw fail('Enter the actual signer and their relationship.',400);
  const subject=p.client_id?await Client.findById(p.client_id,{includeSensitive:true}):null;
  if(p.participant_type==='minor'&&!subject)throw fail('Add this minor to the actual session and verify their authorized guardian on the client record before recording.',403);
  const subjectAge=subject?.date_of_birth?ageOn(subject.date_of_birth):null;
  if(subject&&subjectAge===null)throw fail('Verify the client’s age and consent authority on their record before signing a recording waiver.',403);
  if(subject&&subjectAge<18&&relationship==='self')throw fail('A recorded minor needs their verified authorized signer for this waiver.',400);
  let verifiedSigner=null;
  if(subject&&relationship!=='self'){
    verifiedSigner=(await verifiedSigners(context,subject.id)).find(s=>s.userId===id(input.signerUserId)&&s.relationship!=='self');
    if(!verifiedSigner||verifiedSigner.userId===context.userId)throw fail('Select this client’s existing verified authorized guardian or representative. Complete guardian authority verification on the client record first; a clinician checkbox cannot grant consent rights.',403);
    signerName=verifiedSigner.name;
  }
  const normalizeName=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
  if(relationship==='self'&&normalizeName(signerName)!==normalizeName(decrypt(p.name_encrypted)))throw fail('The recorded adult must sign using their own full name as listed for this session.',400);
  if(p.participant_type==='adult'&&relationship!=='self')throw fail('Each recorded adult signs their own waiver.',400);
  const signature=validateAgreementSignature({...input,typedName:undefined},{name:signerName,clientId:p.client_id||context.clientId,userId:null,...evidence});
  Object.assign(signature,{relationship,authorityConfirmed:true,verifiedSignerUserId:verifiedSigner?.userId||null,presentedByUserId:context.userId,signerPresent:true});
  const pdf=await saveRecordingAgreementPdf(document,[{...signature,role:relationship==='self'?'Participant':'Authorized parent / guardian'}],`recording-waiver-${randomUUID()}.pdf`);
  const attached=await attachSignedPdfToClient({clientId:p.client_id||context.clientId,storagePath:pdf.path,originalName:'audio-recording-consent.pdf',documentTitle:document.title,documentType:'audio_recording_consent',mimeType:'application/pdf',uploadedByUserId:context.userId,agencyIdOverride:context.agencyId,callerLabel:'session_recording_in_person_consent',auditMetadata:{source:'session_recording',recordingId:recording.id,participantId:p.id,documentHash:p.document_hash}});
  if(!attached?.ok)throw fail('The signed waiver could not be saved to the client’s documents. Recording remains off.',503);
  let legacyId=null;
  if(subject?.date_of_birth){
    const consent=await SessionRecordingConsent.create({agencyId:context.agencyId,clientId:subject.id,sessionRecordingId:recording.id,signerFullName:name(subject),signerDob:subject.date_of_birth,matchedBy:'client_id',documentTemplateId:p.document_template_id,createdByUserId:context.userId});
    legacyId=consent.id;
    await pool.execute('UPDATE session_recording_consents SET document_json=?,document_hash=?,signature_json=?,signed_pdf_path=?,signed_at=UTC_TIMESTAMP() WHERE id=?',[JSON.stringify(document),p.document_hash,maybeEncryptNotePayload(JSON.stringify(signature)),pdf.path,legacyId]);
  }
  const [saved]=await pool.execute('UPDATE session_recording_participants SET signature_encrypted=?,signed_at=UTC_TIMESTAMP(),signed_pdf_path=?,signer_relationship=?,legacy_consent_id=?,signer_user_id=?,revoked_at=NULL WHERE id=? AND document_hash=?',[maybeEncryptNotePayload(JSON.stringify(signature)),pdf.path,relationship,legacyId,verifiedSigner?.userId||null,p.id,p.document_hash]);
  if(!saved.affectedRows)throw fail('The waiver changed while it was signed. Review the current waiver again.');
  await invalidate(recording.id);
  return {signed:true,storedInClientDocuments:true};
}
export async function assignRecordingConsent(user,recordingId,participantId,input) {
  const {recording,context}=await recordingForUser(user,recordingId),p=await participantFor(recording,participantId);
  if(!p.client_id)throw fail('Additional recorded participants must sign here. Portal assignments require a verified client relationship.',400);
  const signer=(await verifiedSigners(context,p.client_id)).find(s=>s.userId===id(input.signerUserId));if(!signer||signer.userId===context.userId)throw fail('Select a current authorized client or guardian portal recipient. A clinician cannot sign for the client.',403);
  const subject=p.client_id?await Client.findById(p.client_id,{includeSensitive:true}):null;
  if(subject&&ageOn(subject.date_of_birth)<18&&signer.relationship==='self')throw fail('Select the minor’s verified authorized guardian for recording consent.',403);
  if(!p.document_template_id||!p.document_hash)throw fail('Choose and review a current recording waiver first.',400);
  const template=await DocumentTemplate.findById(p.document_template_id);
  if(!template?.is_active||Number(template.version||1)!==Number(parse(decrypt(p.document_encrypted)).version))throw fail('The waiver changed. Review its current version before assigning.');
  const task=await TaskAssignmentService.assignDocumentTask({title:'Audio recording consent',description:'Review and sign the optional session audio recording waiver.',documentTemplateId:p.document_template_id,assignedByUserId:context.userId,assignedToUserId:signer.userId,assignedToAgencyId:context.agencyId,documentActionType:'signature',metadata:{source:'clinical_session_recording_consent',clientId:p.client_id,recordingId:recording.id,participantId:p.id,documentHash:p.document_hash}});
  await pool.execute('UPDATE session_recording_participants SET task_id=?,signer_user_id=?,signer_relationship=? WHERE id=?',[task.id,signer.userId,signer.relationship,p.id]);await invalidate(recording.id);
  return {assigned:true,taskId:task.id};
}
export async function confirmRecordingSession(user,recordingId,input) {
  const {recording,context}=await recordingForUser(user,recordingId),participants=await currentParticipants(recording,context);
  if(input.allParticipantsListed!==true||input.consentAuthorityReviewed!==true||input.providerAgreesToRecording!==true)throw fail('Confirm every audible participant is listed, valid consent authority, and your own agreement to recording.',400);
  if(context.required.some(p=>!participants.some(r=>r.participant_key===p.key)))throw fail('The appointment participants changed. Reopen recording setup.');
  if(!participants.length||participants.some(p=>!p.consented))throw fail('Every required participant needs an executed waiver before this session can be approved.');
  requireSessionPrivacyConfiguration();
  await pool.execute('UPDATE session_recordings SET confirmed_revision=recording_revision,confirmed_by_user_id=?,confirmed_at=UTC_TIMESTAMP(),capture_paused=1 WHERE id=?',[context.userId,recording.id]);return {confirmed:true};
}
export async function controlSessionRecording(user,recordingId,input) {
  const {recording,context}=await recordingForUser(user,recordingId);
  if(!['start','pause','resume','stop'].includes(input.action))throw fail('Choose start, pause, resume or stop.',400);
  if(['start','resume'].includes(input.action)){
    requireSessionPrivacyConfiguration();const participants=await currentParticipants(recording,context);
    if(context.required.some(p=>!participants.some(r=>r.participant_key===p.key)))throw fail('The appointment participants changed. Refresh required waivers and confirm this session.');
    assertRecordingReady({...recording,status:'recording',capture_paused:0},participants);
    if(recording.status==='completed'||recording.status==='processing')throw fail('This recording has ended. Use its saved narrative.');
    await pool.execute("UPDATE session_recordings SET status='recording',capture_paused=0,started_at=COALESCE(started_at,UTC_TIMESTAMP()) WHERE id=?",[recording.id]);
  }else{
    // Any paused segment revision becomes invalid before the response returns.
    await pool.execute('UPDATE session_recordings SET capture_paused=1,recording_revision=recording_revision+1,confirmed_revision=IF(confirmed_at IS NOT NULL,recording_revision,NULL) WHERE id=?',[recording.id]);
  }
  return {action:input.action};
}
export async function withdrawRecordingConsent(user,recordingId,participantId) {
  const {recording}=await recordingForUser(user,recordingId),p=await participantFor(recording,participantId);
  if(p.client_id)await pool.execute('UPDATE session_recording_consents SET revoked_at=UTC_TIMESTAMP() WHERE agency_id=? AND client_id=? AND revoked_at IS NULL',[recording.agency_id,p.client_id]);
  await pool.execute('UPDATE session_recording_participants SET revoked_at=UTC_TIMESTAMP() WHERE id=?',[p.id]);await invalidate(recording.id);return {withdrawn:true};
}
export async function appendSessionRecordingAudio(user,recordingId,input,file) {
  if(!file?.buffer?.length||file.buffer.length>10*1024*1024||!/^audio\/(webm|ogg|wav|mpeg|mp4)(;.*)?$/i.test(file.mimetype||'')||!/^[-\w]{8,80}$/.test(input.chunkKey||''))throw fail('Send a supported audio segment up to 10 MB with its unique segment id.',400);
  const loaded=await recordingForUser(user,recordingId),recording=loaded.recording;let context=loaded.context;const revision=Number(input.revision);
  const ensure=async(db=pool)=>{const [[current]]=await db.execute('SELECT * FROM session_recordings WHERE id=?',[recording.id]);if(Number(current.recording_revision)!==revision)throw fail('Recording was paused or its consent changed.');const participants=await currentParticipants(current,context,{syncPortal:false});assertRecordingReady(current,participants);if(context.required.some(p=>!participants.some(r=>r.participant_key===p.key)))throw fail('The recorded participants changed. Reconfirm this session.');return current;};
  await ensure();const [old]=await pool.execute('SELECT id FROM session_recording_audio_chunks WHERE session_recording_id=? AND chunk_key=?',[recording.id,input.chunkKey]);if(old.length)return {saved:true,duplicate:true};
  const text=await transcribeLongAudio({buffer:file.buffer,mimeType:file.mimetype,userId:context.userId,enableSpeakerDiarization:true});
  // Session ownership and appointment participants may have changed during STT.
  context=(await recordingForUser(user,recordingId)).context;
  const db=await pool.getConnection();try{await db.beginTransaction();await db.execute('SELECT id FROM session_recordings WHERE id=? FOR UPDATE',[recording.id]);await ensure(db);await db.execute('INSERT IGNORE INTO session_recording_audio_chunks (session_recording_id,chunk_key,recording_revision,transcript_encrypted) VALUES (?,?,?,?)',[recording.id,input.chunkKey,revision,maybeEncryptNotePayload(text)]);await db.commit();}catch(e){await db.rollback();throw e;}finally{db.release();}
  return {saved:true};
}
export async function finishSessionRecording(user,recordingId) {
  const {recording,context}=await recordingForUser(user,recordingId);
  const lockDb=await pool.getConnection(),lockName=`session_recording_narrative:${recording.id}`;let locked=false;
  try {
    const [[lock]]=await lockDb.execute('SELECT GET_LOCK(?,0) AS acquired',[lockName]);locked=Number(lock?.acquired)===1;
    if(!locked)throw fail('This session narrative is already being prepared. Please wait and refresh.');
    const current=await SessionRecording.findById(recording.id);
    if(current.status==='completed'&&current.summary_text)return {recordingId:recording.id,narrative:decrypt(current.summary_text),reviewRequired:true,clinicalSessionId:context.clinical?.id||null,officeEventId:context.office?.id||null};
    await pool.execute('UPDATE session_recordings SET capture_paused=1,recording_revision=recording_revision+1 WHERE id=?',[recording.id]);
    const [chunks]=await pool.execute('SELECT transcript_encrypted FROM session_recording_audio_chunks WHERE session_recording_id=? ORDER BY id',[recording.id]);
    const transcript=chunks.map(c=>decrypt(c.transcript_encrypted)).join('\n').trim();
    if(!transcript)throw fail('No transcript has been captured. Your session remains available without a generated narrative.');
    await pool.execute("UPDATE session_recordings SET status='processing' WHERE id=?",[recording.id]);
    try {
      const allClients=await Promise.all(context.required.filter(p=>p.clientId).map(p=>Client.findById(p.clientId,{includeSensitive:true})));
      const participants=await currentParticipants(recording,context);
      const summary=await summarizeSessionRecording({transcriptText:transcript,sessionKind:'clinical',clientNames:[...allClients.flatMap(c=>[c?.full_name,c?.first_name,c?.last_name,c?.initials]),...participants.map(p=>p.displayName)],providerNames:[user.first_name,user.last_name,user.firstName,user.lastName]});
      await SessionRecording.update(recording.id,{status:'completed',endedAt:new Date(),transcriptText:maybeEncryptNotePayload(transcript),summaryText:maybeEncryptNotePayload(summary.narrative),topicsJson:summary.topics,techniquesJson:summary.techniques});
      return {recordingId:recording.id,narrative:summary.narrative,reviewRequired:true,clinicalSessionId:context.clinical?.id||null,officeEventId:context.office?.id||null};
    } catch(e) {await pool.execute("UPDATE session_recordings SET status='paused',error_message='Narrative generation failed; encrypted transcript is retained.' WHERE id=?",[recording.id]);throw e;}
  } finally {if(locked)await lockDb.execute('SELECT RELEASE_LOCK(?)',[lockName]);lockDb.release();}
}

/** Return only a finished source narrative for this exact authorized encounter. */
export async function getAuthorizedRecordingNarrative({user,agencyId,clientId,clinicalSessionId,officeEventId,recordingId}) {
  const {recording,context}=await loadRecordingForUser(user,recordingId,COMPLETED_NARRATIVE_READ);
  const target=await resolveRecordingContext(user,{agencyId,clientId,clinicalSessionId,officeEventId},COMPLETED_NARRATIVE_READ);
  if(context.key!==target.key||Number(recording.agency_id)!==Number(agencyId)||Number(recording.client_id)!==Number(clientId))throw fail('This recording belongs to a different encounter.',403);
  if(recording.status!=='completed'||!recording.summary_text)throw fail('This session narrative is not ready. Return to its recorder and finish processing.');
  return {recordingId:Number(recording.id),narrative:decrypt(recording.summary_text),reviewRequired:true,clinicalSessionId:target.clinical?.id||null,officeEventId:target.office?.id||null};
}
