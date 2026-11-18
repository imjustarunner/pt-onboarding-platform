// Scoped recovery explicitly requested by the user. No application login,
// credentials, human audit actor, new signature, or guardian access grant.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const requireBackend=createRequire(new URL('../../backend/package.json',import.meta.url));
import pool from '../../backend/src/config/database.js';
import {decryptIntakeSubmissionRow} from '../../backend/src/services/intakeResponsesEncryption.service.js';
import {normalizeSmartSchoolRoiResponse,validateSmartSchoolRoiResponse,buildSmartSchoolRoiHtml} from '../../backend/src/services/smartSchoolRoi.service.js';
import {loadGuardianRoiConsent} from '../../backend/src/services/schoolRoiGuardianConsent.service.js';
import ClientSchoolStaffRoiAccess from '../../backend/src/models/ClientSchoolStaffRoiAccess.model.js';
import DocumentSigningService from '../../backend/src/services/documentSigning.service.js';
import StorageService from '../../backend/src/services/storage.service.js';
import {schoolRoiCalendarDates} from '../../backend/src/utils/schoolRoiCalendarDate.js';
const scope={agencyId:2,schoolId:326,clientId:938,guardianId:925,submissionId:1627,issuedId:371};
const incident='school-roi-saved-signature-recovery-20261118';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const apply=process.argv.includes('--apply');
const db=await pool.getConnection();
try {
 await db.query('START TRANSACTION READ ONLY');
 const [[principal]]=await db.query('SELECT CURRENT_USER() AS dbPrincipal');
 const [[raw]]=await db.execute('SELECT * FROM intake_submissions WHERE id=?',[scope.submissionId]);
 const [[issued]]=await db.execute('SELECT * FROM client_school_roi_signing_links WHERE id=?',[scope.issuedId]);
 const [[client]]=await db.execute('SELECT id,agency_id,organization_id FROM clients WHERE id=?',[scope.clientId]);
 const [[guardian]]=await db.execute(`SELECT cg.*,u.email,u.first_name,u.last_name,u.is_active FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=? AND cg.guardian_user_id=?`,[scope.clientId,scope.guardianId]);
 assert(raw&&issued&&client&&guardian,'Recovery scope no longer exists.');
 assert.equal(client.agency_id,scope.agencyId);assert.equal(client.organization_id,scope.schoolId);
 assert.equal(raw.client_id,scope.clientId);assert.equal(issued.client_id,scope.clientId);
 assert.equal(issued.latest_intake_submission_id,scope.submissionId);assert.equal(issued.intake_link_id,raw.intake_link_id);
 if(issued.status==='completed'&&raw.combined_pdf_path){console.log(JSON.stringify({alreadyRecovered:true,...scope}));await db.rollback();process.exitCode=0;}
 else {
 assert.equal(issued.status,'in_progress');assert.equal(raw.status,'submitted');assert(!raw.combined_pdf_path);
 const permissions=parse(guardian.permissions_json)||{};
 // Portal account verification is distinct from staff accepting an existing
 // legal signature. Never lift an explicit contact, custody, document or role restriction.
 assert(guardian.is_active && (!raw.guardian_user_id||raw.guardian_user_id===scope.guardianId));
 for(const field of ['noView','noViewOtherGuardian','billingOnly','noContact','no_contact','contactRestricted','revoked','relationshipRevoked'])assert(!permissions[field],`Restricted guardian: ${field}`);
 assert(permissions.canSignDocs!==false);
 assert(guardian.access_enabled===1||(permissions.pendingGuardianVerification===true&&permissions.accountPreparationSource==='saved_guardian_contact'),'Disabled relationship requires separate review.');
 const submission=decryptIntakeSubmissionRow({...raw});const data=parse(submission.intake_data);
 assert.equal(String(submission.signer_email).trim().toLowerCase(),String(guardian.email).trim().toLowerCase());
 assert.equal(String(data.smartSchoolRoi.signer.email).trim().toLowerCase(),String(guardian.email).trim().toLowerCase());
 const signature=data.smartSchoolRoi.signatureData;
 assert(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature),'Original PNG signature is required.');
 const context=parse(issued.roi_context_json);
 assert.equal(context.client.id,scope.clientId);assert.equal(context.school.id,scope.schoolId);assert.equal(context.agency.id,scope.agencyId);
 assert(context.requiredAcknowledgements?.length&&context.waiverItems?.length&&context.staffRoster?.length,'Original form wording and roster are required.');
 const signedAt=new Date(raw.submitted_at);assert(Number.isFinite(+signedAt));
 const response=normalizeSmartSchoolRoiResponse({roiContext:context,intakeData:data,signedAt});
 assert(validateSmartSchoolRoiResponse(response).valid,'Original release responses are incomplete.');
 const [[template]]=await db.execute(`SELECT id,name FROM document_templates WHERE is_active=1 AND document_type IN ('smart_school_roi','school_roi','school') ORDER BY (organization_id=?) DESC,(organization_id IS NULL) DESC,FIELD(document_type,'smart_school_roi','school_roi','school'),id DESC LIMIT 1`,[scope.schoolId]);
 assert(template,'A document metadata wrapper is required. Original wording comes solely from the retained context.');
 const [[existing]]=await db.execute('SELECT COUNT(*) n FROM intake_submission_documents WHERE intake_submission_id=?',[scope.submissionId]);assert.equal(Number(existing.n),0);
 const payloadHash=hash(raw.payload_encrypted),contextHash=hash(JSON.stringify(context));
 const annotation={incident,recoveredAt:new Date().toISOString(),...scope,processingActor:{kind:'automation',name:'Codex scoped ROI recovery',dbPrincipal:principal.dbPrincipal},
   authority:'Explicit user request to accept this parent’s saved school ROI',originalSubmissionStatus:raw.status,originalGuardianUserId:raw.guardian_user_id,
   signedAt:signedAt.toISOString(),retainedPayloadHash:payloadHash,retainedContextHash:contextHash,retainedSignatureHash:hash(signature),
   originalEvidencePreserved:true,guardianPortalAccessChanged:false,signatureReused:true,newSignatureCollected:false};
 const report={...scope,canRecover:true,originalSignedAt:signedAt.toISOString(),staffDecisionCount:response.staffDecisions.length,guardianPortalAccess:guardian.access_enabled,applied:false};
 await db.rollback();
 if(apply){
   const accessToken=execFileSync('/Users/mendez/google-cloud-sdk/bin/gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
   StorageService.saveIntakeSignedDocument=async ({submissionId,templateId,fileBuffer,filename})=>{
     const key=`intake_signed/${submissionId}/${templateId}/${filename}`;
     const endpoint=new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(process.env.PTONBOARDFILES)}/o`);
     endpoint.searchParams.set('uploadType','media');endpoint.searchParams.set('name',key);endpoint.searchParams.set('ifGenerationMatch','0');
     const uploaded=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/pdf'},body:fileBuffer});
     if(!uploaded.ok)throw new Error(`Signed ROI upload failed (${uploaded.status}); database was not changed.`);
     const object=await uploaded.json();assert.equal(object.name,key);
     return {relativePath:key};
   };
   const signer={id:null,firstName:guardian.first_name,lastName:guardian.last_name,email:submission.signer_email};
   const audit={smartSchoolRoi:true,roiResponse:response,signerName:submission.signer_name,signerRole:'guardian',signedAt:signedAt.toISOString(),timeZone:context.agency.timezone,processingRecovery:annotation};
   const pdf=await DocumentSigningService.generateFinalizedPDF(null,'html',buildSmartSchoolRoiHtml({roiContext:context,response,signedAt}),signature,
     {consent_given_at:raw.consent_given_at,intent_to_sign_at:signedAt,consent_ip:raw.ip_address},signer,audit,{},
     {referenceNumber:`ROI-${scope.submissionId}-RECOVERED`,documentName:'School Release of Information',signatureOnAuditPage:false,omitRawAuditTrail:true,timeZone:context.agency.timezone});
   const {PDFDocument,StandardFonts}=requireBackend('pdf-lib');
   const recoveredPdf=await PDFDocument.load(pdf),page=recoveredPdf.addPage([612,792]),font=await recoveredPdf.embedFont(StandardFonts.Helvetica);
   ['Recovery processing annotation',`Reference: ${incident}`,`Original signature captured: ${signedAt.toISOString()}`,`Recovery processed: ${annotation.recoveredAt}`,
    'Processed by Codex scoped recovery automation using operational access.',
    'The original signature and form answers were reused at the user request.',
    'No new parent signature was collected. Original evidence was retained.',
    'Guardian portal access was not changed by this recovery.'].forEach((line,index)=>page.drawText(line,{x:48,y:730-index*24,size:index===0?16:10,font}));
   const finalPdf=await recoveredPdf.save();
   const pdfHash=hash(finalPdf),stored=await StorageService.saveIntakeSignedDocument({submissionId:scope.submissionId,templateId:template.id,fileBuffer:Buffer.from(finalPdf),filename:`school-roi-${scope.submissionId}-recovered.pdf`});
   await db.beginTransaction();
   const [[lockedClient]]=await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? AND organization_id=? FOR UPDATE',[scope.clientId,scope.agencyId,scope.schoolId]);assert(lockedClient);
   const [[nowRaw]]=await db.execute('SELECT payload_encrypted,combined_pdf_path FROM intake_submissions WHERE id=? FOR UPDATE',[scope.submissionId]);assert.equal(hash(nowRaw.payload_encrypted),payloadHash);assert(!nowRaw.combined_pdf_path);
   const [[nowIssued]]=await db.execute('SELECT status,latest_intake_submission_id,roi_context_json FROM client_school_roi_signing_links WHERE id=? FOR UPDATE',[scope.issuedId]);assert.equal(nowIssued.status,'in_progress');assert.equal(nowIssued.latest_intake_submission_id,scope.submissionId);assert.equal(hash(JSON.stringify(parse(nowIssued.roi_context_json))),contextHash);
   const [auditEvent]=await db.execute(`INSERT INTO user_activity_log (action_type,user_id,user_agent,agency_id,metadata) VALUES ('school_roi_saved_signature_recovered',NULL,'Codex scoped ROI recovery',?,?)`,[scope.agencyId,JSON.stringify(annotation)]);
   const [document]=await db.execute(`INSERT INTO intake_submission_documents (intake_submission_id,client_id,document_template_id,signed_pdf_path,pdf_hash,signed_at,audit_trail) VALUES (?,?,?,?,?,?,?)`,[scope.submissionId,scope.clientId,template.id,stored.relativePath,pdfHash,signedAt,JSON.stringify(audit)]);
   const [phi]=await db.execute(`INSERT INTO client_phi_documents (client_id,agency_id,school_organization_id,intake_submission_id,storage_path,original_name,document_title,document_type,mime_type,uploaded_by_user_id,scan_status) VALUES (?,?,?,?,?,?,?,'school_roi','application/pdf',NULL,'clean')`,[scope.clientId,scope.agencyId,scope.schoolId,scope.submissionId,stored.relativePath,'School Release of Information (Signed)','School Release of Information (Signed)']);
   await db.execute(`INSERT INTO phi_document_audit_logs (document_id,client_id,action,actor_user_id,actor_label,metadata) VALUES (?,?,'uploaded',NULL,'Codex scoped ROI recovery',?)`,[phi.insertId,scope.clientId,JSON.stringify(annotation)]);
   await db.execute('UPDATE intake_submissions SET guardian_user_id=?,combined_pdf_path=?,combined_pdf_hash=? WHERE id=?',[scope.guardianId,stored.relativePath,pdfHash,scope.submissionId]);
   const expiry=new Date(signedAt);expiry.setUTCFullYear(expiry.getUTCFullYear()+3);
   for(const staff of response.staffDecisions)await db.execute(`INSERT INTO client_school_roi_guardian_decisions (client_id,school_organization_id,guardian_user_id,school_staff_user_id,intake_submission_id,decision,signed_at,expires_at) VALUES (?,?,?,?,?,?,?,?)`,[scope.clientId,scope.schoolId,scope.guardianId,staff.schoolStaffUserId,scope.submissionId,staff.decision,signedAt,expiry]);
   const consent=await loadGuardianRoiConsent({clientId:scope.clientId,schoolOrganizationId:scope.schoolId,db});
   for(const item of consent)await ClientSchoolStaffRoiAccess.setAccessState({clientId:scope.clientId,schoolOrganizationId:scope.schoolId,schoolStaffUserId:item.schoolStaffUserId,nextState:item.effectiveDecision==='none'?'packet':item.effectiveDecision,actorUserId:null,skipGuardianPolicy:true,db});
   const dates=schoolRoiCalendarDates(signedAt,context.agency.timezone);
   await db.execute('UPDATE clients SET roi_expires_at=? WHERE id=?',[dates.roiExpiresAt,scope.clientId]);
   await db.execute(`UPDATE client_school_roi_signing_links SET status='completed',signed_at=?,completed_client_phi_document_id=?,roi_response_json=?,access_applied_at=UTC_TIMESTAMP() WHERE id=?`,[signedAt,phi.insertId,JSON.stringify(response),scope.issuedId]);
   await db.commit();
   Object.assign(report,{applied:true,documentId:document.insertId,phiDocumentId:phi.insertId,auditEventId:auditEvent.insertId,roiExpiresAt:dates.roiExpiresAt});
 }
 fs.writeFileSync(new URL('./recovery-receipt.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 }
} catch(error){await db.rollback();console.error(JSON.stringify({recoveryFailed:true,message:error.message}));process.exitCode=1;}
finally{db.release();await pool.end();}
