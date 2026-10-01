import {randomUUID,createHash} from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import pool from '../config/database.js';
import SessionRecordingConsent from '../models/SessionRecordingConsent.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import StorageService from '../services/storage.service.js';
import {assertSessionAccess} from './counselingSessions.controller.js';
import {counselingClient} from '../services/counselingInvitationAccess.service.js';
import {isMentalHealthAgency} from '../services/supervisionAgreement.service.js';
import {documentHash,validateAgreementSignature,saveRecordingAgreementPdf,renderRecordingAgreement} from '../services/recordingAgreementDocument.service.js';
import {encryptGuardianIntake} from '../services/guardianIntakeEncryption.service.js';
import {attachSignedPdfToClient} from '../services/phiDocumentAttachment.service.js';
const fail=(message,status=403)=>{throw Object.assign(new Error(message),{status});};
const json=v=>typeof v==='string'?JSON.parse(v):v;
export async function clientRecordingContext(req) {
  const {session,participantRole}=await assertSessionAccess(req,req.params.sessionId);
  if(!await isMentalHealthAgency(session.agency_id))fail('Recording consent is available for mental health sessions only.');
  return {session,participantRole,client:await counselingClient(session)};
}
export async function getClientRecordingConsent(req,res,next) {
  try{
    const {session,participantRole,client}=await clientRecordingContext(req);
    const requested=!!Number(session.recording_requested);
    const onFile=await SessionRecordingConsent.findOnFile({agencyId:session.agency_id,clientId:client.id});
    let templates=[],agreement=null;
    if(participantRole==='provider') {
      const [rows]=await pool.execute(`SELECT id,name,template_type FROM document_templates WHERE (agency_id=? OR agency_id IS NULL) AND document_type='audio_recording_consent' AND is_active=1 ORDER BY name`,[session.agency_id]);templates=rows;
    }
    if(requested&&!onFile&&session.recording_consent_id){const row=await SessionRecordingConsent.findById(session.recording_consent_id);
      if(row && Number(row.client_id)===Number(client.id) && Number(row.agency_id)===Number(session.agency_id) && !row.revoked_at){const document=json(row.document_json);agreement={id:row.id,documentHash:row.document_hash,html:renderRecordingAgreement(document),templateType:document.templateType,signerName:row.signer_full_name};}}
    res.set('Cache-Control','no-store').json({requested,onFile:!!onFile,signedAt:onFile?.signed_at||null,templates,agreement,canRequest:participantRole==='provider'});
  }catch(e){next(e);}
}
export async function requestClientRecordingConsent(req,res,next) {
  try{
    const {session,participantRole,client}=await clientRecordingContext(req);
    if(participantRole!=='provider')fail('Only the session provider can request recording consent.');
    if(session.status==='ended')fail('This session has ended.',410);
    if(req.body.enabled===false){await pool.execute('UPDATE counseling_sessions SET recording_requested=0 WHERE id=?',[session.id]);await pool.execute("UPDATE meeting_transcription_controls SET paused=1,revision=revision+1 WHERE meeting_type='counseling' AND meeting_id=?",[session.id]);return res.json({requested:false});}
    const onFile=await SessionRecordingConsent.findOnFile({agencyId:session.agency_id,clientId:client.id});
    let consentId=onFile?.id;
    if(!onFile){
      const template=await DocumentTemplate.findById(Number(req.body.templateId));
      if(!template||(template.agency_id!=null&&Number(template.agency_id)!==Number(session.agency_id))||template.document_type!=='audio_recording_consent'||!template.is_active)fail('Choose an active audio recording consent from this agency.',400);
      const [[agency]]=await pool.execute('SELECT name FROM agencies WHERE id=?',[session.agency_id]);
      const document={title:template.name,version:template.version||1,agencyName:agency.name,templateId:template.id,templateType:template.template_type,
        parties:[{role:'Client',name:client.full_name||client.initials}],text:'Your signature applies to the attached audio recording consent.'};
      if(template.template_type==='pdf'){document.templatePath=template.file_path;document.templateHash=createHash('sha256').update(await StorageService.readObject(template.file_path)).digest('hex');}
      else document.html=sanitizeHtml(template.html_content||'',{allowedTags:sanitizeHtml.defaults.allowedTags.concat(['h1','h2']),allowedAttributes:{...sanitizeHtml.defaults.allowedAttributes}});
      if(template.template_type!=='pdf'&&!document.html?.trim())fail('This consent template is empty. Choose a complete audio recording waiver.',400);
      if(!client.date_of_birth)fail('Add the client’s date of birth to their file before requesting this consent.',409);
      const consent=await SessionRecordingConsent.create({agencyId:session.agency_id,clientId:client.id,createdByUserId:session.provider_user_id,signerFullName:client.full_name||client.initials,signerDob:client.date_of_birth,matchedBy:'client_id',documentTemplateId:template.id});consentId=consent.id;
      await pool.execute('UPDATE session_recording_consents SET document_json=?,document_hash=? WHERE id=?',[JSON.stringify(document),documentHash(document),consentId]);
    }
    await pool.execute('UPDATE counseling_sessions SET recording_requested=1,recording_consent_id=? WHERE id=?',[consentId,session.id]);
    res.json({requested:true,onFile:!!onFile});
  }catch(e){next(e);}
}
export async function previewClientConsentPdf(req,res,next){try{const{session}=await clientRecordingContext(req);if(!Number(session.recording_requested))fail('No consent requested.',404);const row=await SessionRecordingConsent.findById(session.recording_consent_id);const document=json(row?.document_json);if(document?.templateType!=='pdf')fail('PDF not found.',404);res.set({'Content-Type':'application/pdf','Cache-Control':'no-store'}).send(await StorageService.readObject(document.templatePath));}catch(e){next(e);}}
export async function signClientRecordingConsent(req,res,next) {
  let db;
  try{
    const {session,participantRole,client}=await clientRecordingContext(req);
    if(participantRole!=='client'||!Number(session.recording_requested))fail('Only the invited client or their guardian can sign a requested consent.');
    db=await pool.getConnection();await db.beginTransaction();
    const [[row]]=await db.execute('SELECT * FROM session_recording_consents WHERE id=? FOR UPDATE',[session.recording_consent_id]);
    if(!row||row.revoked_at||Number(row.client_id)!==Number(client.id)||Number(row.agency_id)!==Number(session.agency_id))fail('Consent is unavailable.',410);
    if(row.signed_at){await db.commit();return res.json({signed:true});}
    if(req.body.documentHash!==row.document_hash)fail('Review the current consent before signing.',409);
    const signerName=String(req.body.signerName||'').trim();if(!signerName)fail('Enter the name of the person signing.',400);
    const relation=String(req.body.relationship||'');if(!['self','parent','legal_guardian'].includes(relation))fail('Choose whether you are the client or their parent/legal guardian.',400);
    if(relation!=='self'&&req.body.guardianAuthority!==true)fail('Confirm your authority to consent for this client.',400);
    const evidence={...validateAgreementSignature(req.body,{name:signerName,clientId:client.id,userId:req.user.id||null,ip:req.ip,userAgent:req.get('user-agent')}),relationship:relation,guardianAuthority:req.body.guardianAuthority===true};
    const document=json(row.document_json);const pdf=await saveRecordingAgreementPdf(document,[{...evidence,role:relation==='self'?'Client':'Parent / legal guardian'}],`client-recording-consent-${row.id}-${randomUUID()}.pdf`);
    const attached=await attachSignedPdfToClient({clientId:client.id,storagePath:pdf.path,originalName:'audio-recording-consent.pdf',documentTitle:document.title,documentType:'audio_recording_consent',mimeType:'application/pdf',uploadedByUserId:session.provider_user_id,agencyIdOverride:session.agency_id,schoolOrganizationIdOverride:session.agency_id,callerLabel:'client_session_consent',auditMetadata:{source:'client_session_consent',consentId:row.id,documentHash:row.document_hash}});
    if(!attached?.ok)fail('The signed consent could not be saved to the client file. Please retry.',503);
    await db.execute('UPDATE session_recording_consents SET signature_json=?,signed_at=UTC_TIMESTAMP(),signed_pdf_path=? WHERE id=?',[JSON.stringify(encryptGuardianIntake(JSON.stringify(evidence))),pdf.path,row.id]);
    await db.commit();res.json({signed:true,onFile:true});
  }catch(e){if(db)await db.rollback();next(e);}finally{db?.release();}
}

export async function withdrawClientRecordingConsent(req,res,next){let db;try{
  const {session,client}=await clientRecordingContext(req);
  db=await pool.getConnection();await db.beginTransaction();
  // Pause every open room for this client before revoking reusable consent.
  await db.execute(`UPDATE meeting_transcription_controls c JOIN counseling_sessions s ON s.id=c.meeting_id
    JOIN session_recording_consents consent ON consent.id=s.recording_consent_id
    SET c.paused=1,c.revision=c.revision+1 WHERE c.meeting_type='counseling' AND consent.agency_id=? AND consent.client_id=?`,[session.agency_id,client.id]);
  await db.execute('UPDATE session_recording_consents SET revoked_at=UTC_TIMESTAMP() WHERE agency_id=? AND client_id=? AND revoked_at IS NULL',[session.agency_id,client.id]);
  await db.execute(`UPDATE counseling_sessions s JOIN session_recording_consents consent ON consent.id=s.recording_consent_id SET s.recording_requested=0 WHERE consent.agency_id=? AND consent.client_id=?`,[session.agency_id,client.id]);
  await db.commit();res.json({withdrawn:true});
}catch(e){if(db)await db.rollback();next(e);}finally{db?.release();}}
