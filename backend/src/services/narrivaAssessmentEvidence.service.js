import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import ClinicalDocument from '../models/clinical/ClinicalDocument.model.js';
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import {requireNarrivaAgency,requireNarrivaClient,positiveId,narrivaError,parseNarrivaObject as parse} from './narrivaAccess.service.js';
import {resolveNoteDocumentationPolicy} from './supervisedBillingPolicy.service.js';
import {resolveClientRecordAccess} from './clientRecordAccess.service.js';
import {isSupervisorActor,supervisorCanAccessClient} from '../utils/supervisorSchoolAccess.js';
import {sessionMaterialAccess,uploadMaterial,scanMaterial,downloadMaterial} from './sessionSupportingMaterials.service.js';
import StorageService from './storage.service.js';
import DocumentEncryptionService from './documentEncryption.service.js';
import {narrivaSourceHash} from './narrivaReviewPolicy.service.js';
import {containsNarrivaIdentifiers} from './narrivaInputPrivacy.service.js';
import {privateScanInProgress} from './privatePacketScanJob.service.js';
const KINDS=new Set(['client_document','session_material']);
const SUPPORTED_TYPES=new Set(['application/pdf','image/jpeg','image/png']);
const MATERIAL_TYPE='session_supporting_material';
function array(value){if(Array.isArray(value))return value;if(typeof value==='string'){try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{throw narrivaError(400,'Assessment evidence must be a list of saved attachments.');}}return [];}
export function normalizeNarrivaAssessmentSelection(input={}) {
 const refs=[...array(input.assessmentEvidence),...array(input.assessmentDocumentIds).map(id=>({kind:'client_document',id}))];
 if(refs.length>50)throw narrivaError(400,'Link up to 50 assessment attachments.');
 const unique=new Map();
 for(const item of refs){if(!KINDS.has(item?.kind)||!positiveId(item.id))throw narrivaError(400,'Choose an existing client document or session material.');const ref={kind:item.kind,id:Number(item.id)};unique.set(`${ref.kind}:${ref.id}`,ref);}
 return [...unique.values()];
}
/** Current client/source authorization; the trusted reviewer option is server-only. */
export async function authorizeNarrivaAssessmentContext(user,input,{authorizedNoteReviewer=false,clinicalDb=clinicalPool}={}) {
 const agencyId=positiveId(input.agencyId),clientId=positiveId(input.clientId);
 if(!agencyId||!clientId)throw narrivaError(400,'Choose the client and workspace for this assessment.');
 await requireNarrivaAgency(user,agencyId);
 let sessionId=positiveId(input.clinicalSessionId),reviewer=authorizedNoteReviewer===true;
 if(input.noteId){
  const [[note]]=await clinicalDb.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? AND client_id=? AND is_deleted=0',[positiveId(input.noteId),agencyId,clientId]);
  if(!note)throw narrivaError(404,'The note is not available for this client and workspace.');
  const meta=parse(note.metadata_json);if(meta.restricted||meta.privatePsychotherapyNote)throw narrivaError(403,'Restricted records require their authorized disclosure workflow.');
  const policy=await resolveNoteDocumentationPolicy(note,pool,clinicalDb);
  if(Number(note.created_by_user_id)!==Number(user.id)&&Number(note.provider_signed_by_user_id)!==Number(user.id)&&Number(policy.supervisorUserId)!==Number(user.id)&&!['admin','agency_admin','super_admin'].includes(user.role))throw narrivaError(403,'Only the note author or assigned reviewer may link assessment evidence.');
  if(sessionId&&Number(note.clinical_session_id)!==sessionId)throw narrivaError(409,'The note and selected session do not match.');
  sessionId=sessionId||positiveId(note.clinical_session_id);reviewer=true;
 }
 if(input.draftId){
  const draft=await ClinicalNoteDraft.findByIdForUser({draftId:positiveId(input.draftId),userId:user.id});
  if(!draft||Number(draft.agency_id)!==agencyId||Number(draft.client_id)!==clientId)throw narrivaError(404,'The draft is not available for this client and workspace.');
  if(sessionId&&draft.clinical_session_id&&Number(draft.clinical_session_id)!==sessionId)throw narrivaError(409,'The draft and selected session do not match.');
  sessionId=sessionId||positiveId(draft.clinical_session_id);
 }
 const client=await requireNarrivaClient(user,agencyId,clientId,{authorizedNoteReviewer:reviewer});
 let session=null;
 if(sessionId){session=await ClinicalSession.findById(sessionId);if(!session||session.is_deleted||Number(session.agency_id)!==agencyId||Number(session.client_id)!==clientId)throw narrivaError(404,'This client’s session is not available in this workspace.');}
 if(!reviewer){
  const access=await resolveClientRecordAccess({userId:user.id,role:user.role,clientId});
  const supervised=access.client&&await isSupervisorActor({userId:user.id,role:user.role,user})&&await supervisorCanAccessClient({supervisorUserId:user.id,client:access.client});
  if(!access.ok&&!supervised || !['admin','agency_admin','super_admin'].includes(user.role)&&!access.isAssignedClinician&&!supervised)throw narrivaError(403,'Assigned clinician or supervisor access is required for assessment documents.');
 }
 let canUpload=false;
 if(session){try{await sessionMaterialAccess(user,session.id,{write:true});canUpload=true;}catch(error){if(error.status!==403)throw error;}}
 return {agencyId,clientId,client,session,sessionId:session?.id||null,canUpload,authorizedNoteReviewer:reviewer};
}
function isCurrentClean(doc){return !!doc&&!doc.removed_at&&(!doc.expires_at||new Date(doc.expires_at)>new Date())&&doc.scan_status==='clean'&&!doc.quarantine_path;}
function metadata(row){return parse(row.metadata_json);}
function safeTitle(doc,context){const raw=String(doc.document_title||doc.title||'Assessment attachment').trim().slice(0,255);return containsNarrivaIdentifiers(raw,[context.client.full_name,context.client.first_name,context.client.last_name,context.client.email].filter(Boolean))?'Assessment attachment':raw||'Assessment attachment';}
const key=ref=>`${ref.kind}:${ref.id}`;
function manifest(kind,id,doc,linked=null){return {kind,id:Number(id),phiDocumentId:Number(doc.id),clinicalSessionId:linked?.clinical_session_id?Number(linked.clinical_session_id):null,
 version:narrivaSourceHash({storagePath:doc.storage_path,updatedAt:doc.updated_at,scanStatus:doc.scan_status,scannedAt:doc.scanned_at,encryptionKeyId:doc.encryption_key_id,encryptionIv:doc.encryption_iv,encryptionAuthTag:doc.encryption_auth_tag,linkedUpdatedAt:linked?.updated_at})};}
const PHI_FIELDS='id,client_id,agency_id,document_title,document_type,mime_type,storage_path,updated_at,uploaded_at,scanned_at,scan_status,scan_result,quarantine_path,removed_at,expires_at,is_encrypted,encryption_key_id,encryption_iv,encryption_auth_tag';
/** Metadata only. Assessment bytes are never read or sent to a writing model. */
export async function loadNarrivaAssessmentEvidence(user,input,options={}) {
 const context=await authorizeNarrivaAssessmentContext(user,input,options),requested=normalizeNarrivaAssessmentSelection(input),byKey=new Map();
 const [recent]=await pool.execute(`SELECT ${PHI_FIELDS} FROM client_phi_documents WHERE client_id=? AND agency_id=? AND mime_type='application/pdf' AND (document_type IS NULL OR document_type<>?) AND removed_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) ORDER BY uploaded_at DESC,id DESC LIMIT 100`,[context.clientId,context.agencyId,MATERIAL_TYPE]);
 const clientIds=requested.filter(r=>r.kind==='client_document').map(r=>r.id);
 const [selected]=clientIds.length?await pool.execute(`SELECT ${PHI_FIELDS} FROM client_phi_documents WHERE client_id=? AND agency_id=? AND id IN (${clientIds.map(()=>'?').join(',')})`,[context.clientId,context.agencyId,...clientIds]):[[]];
 for(const doc of [...recent,...selected]){
  if(Number(doc.client_id)!==context.clientId||Number(doc.agency_id)!==context.agencyId||doc.mime_type!=='application/pdf'||doc.document_type===MATERIAL_TYPE||doc.removed_at||(doc.expires_at&&new Date(doc.expires_at)<=new Date()))continue;
  byKey.set(`client_document:${doc.id}`,{choice:{kind:'client_document',id:Number(doc.id),title:safeTitle(doc,context),mimeType:doc.mime_type,createdAt:doc.uploaded_at,available:isCurrentClean(doc),scanStatus:doc.scan_status||'pending'},manifest:manifest('client_document',doc.id,doc)});
 }
 if(context.session){
  const linked=await ClinicalDocument.listBySession({clinicalSessionId:context.session.id});
  for(const row of linked){
   if(row.is_deleted||row.document_type!==MATERIAL_TYPE||Number(row.clinical_session_id)!==Number(context.session.id)||Number(row.client_id)!==context.clientId||Number(row.agency_id)!==context.agencyId)continue;
   const phiId=positiveId(metadata(row).phiDocumentId);if(!phiId)continue;
   const doc=await ClientPhiDocument.findById(phiId);
   if(!doc||doc.document_type!==MATERIAL_TYPE||Number(doc.client_id)!==context.clientId||Number(doc.agency_id)!==context.agencyId||!doc.is_encrypted||!SUPPORTED_TYPES.has(doc.mime_type)||doc.removed_at||(doc.expires_at&&new Date(doc.expires_at)<=new Date()))continue;
   byKey.set(`session_material:${row.id}`,{choice:{kind:'session_material',id:Number(row.id),title:safeTitle({...doc,title:row.title},context),mimeType:doc.mime_type,createdAt:row.created_at,available:isCurrentClean(doc),scanStatus:doc.scan_status||'pending',...(privateScanInProgress(doc)?{scanQueued:true}:{})},manifest:manifest('session_material',row.id,doc,row)});
  }
 }
 const verified=requested.map(r=>byKey.get(key(r))).filter(item=>item?.choice.available),verifiedKeys=new Set(verified.map(item=>key(item.choice)));
 return {choices:[...byKey.values()].map(item=>item.choice),selected:requested.filter(r=>verifiedKeys.has(key(r))),rejected:requested.filter(r=>!verifiedKeys.has(key(r))),verifiedManifest:verified.map(item=>item.manifest).sort((a,b)=>key(a).localeCompare(key(b))),canUpload:context.canUpload,clinicalSessionId:context.sessionId};
}
export async function uploadNarrivaAssessment(req,input,file) {
 const context=await authorizeNarrivaAssessmentContext(req.user,input);
 if(!context.session||!context.canUpload)throw narrivaError(403,'Open the actual session as an authorized clinician before uploading an assessment.');
 const saved=await uploadMaterial(req,context.session.id,file,String(input.title||'Assessment attachment').trim());
 return {attachment:{kind:'session_material',id:Number(saved.id),available:saved.available,scanStatus:saved.scanStatus},...(await loadNarrivaAssessmentEvidence(req.user,input))};
}
export async function rescanNarrivaAssessment(req,input,materialId) {
 const context=await authorizeNarrivaAssessmentContext(req.user,input);
 if(!context.session||!context.canUpload)throw narrivaError(403,'This session’s assessment upload permission is required to retry its private security scan.');
 await scanMaterial(req,context.session.id,materialId);
 return loadNarrivaAssessmentEvidence(req.user,input);
}
export async function viewNarrivaAssessment(req,input,ref) {
 const context=await authorizeNarrivaAssessmentContext(req.user,input),checked={kind:ref.kind,id:positiveId(ref.id)};
 if(!KINDS.has(checked.kind)||!checked.id)throw narrivaError(400,'Choose an assessment attachment.');
 const evidence=await loadNarrivaAssessmentEvidence(req.user,{...input,assessmentEvidence:[checked],assessmentDocumentIds:[]});
 if(!evidence.selected.some(r=>key(r)===key(checked)))throw narrivaError(404,'The assessment is unavailable, removed, quarantined, or not part of this client/session.');
 if(checked.kind==='session_material')return downloadMaterial(req,context.session.id,checked.id);
 const doc=await ClientPhiDocument.findById(checked.id);
 if(!doc||Number(doc.client_id)!==context.clientId||Number(doc.agency_id)!==context.agencyId||doc.mime_type!=='application/pdf'||doc.document_type===MATERIAL_TYPE||!isCurrentClean(doc))throw narrivaError(404,'The current assessment document is unavailable.');
 const stored=await StorageService.readObject(doc.storage_path),body=doc.is_encrypted?await DocumentEncryptionService.decryptPhiDocumentBuffer(doc,stored):stored;
 await PhiDocumentAuditLog.create({documentId:doc.id,clientId:context.clientId,action:'viewed',actorUserId:req.user.id});
 return {body,type:'application/pdf',name:'assessment.pdf'};
}
