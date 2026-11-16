import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import StorageService from './storage.service.js';
import DocumentEncryptionService from './documentEncryption.service.js';
import { scanSessionMaterial } from './sessionMaterialScan.service.js';
import { queuePrivatePacketScan } from './privatePacketScanJob.service.js';
import { withHistoricalImportLock } from './ehrHistoricalImportLock.service.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import pool from '../config/database.js';
export const HISTORY_TYPE='private_client_medical_history';
const fail=(status,message)=>Object.assign(Error(message),{status});
export function historyPresentation(doc){return{id:Number(doc.id),original_name:doc.original_name,document_title:doc.document_title,uploaded_at:doc.uploaded_at,scanStatus:doc.scan_status,available:doc.scan_status==='clean'&&!doc.quarantine_path};}
export async function listChartHistory(scope){return(await ClientPhiDocument.findByClientId(scope.clientId,{includePrivateHistory:true})).filter(doc=>doc.document_type===HISTORY_TYPE&&!doc.removed_at&&Number(doc.agency_id)===scope.agencyId).map(historyPresentation);}
async function getDocument(scope,id){
 const doc=await ClientPhiDocument.findById(Number(id),{includePrivateHistory:true});
 if(!doc||doc.removed_at||Number(doc.client_id)!==scope.clientId||Number(doc.agency_id)!==scope.agencyId||doc.document_type!==HISTORY_TYPE||Number(doc.is_encrypted)!==1||!String(doc.storage_path).startsWith(`private-chart-history/${scope.agencyId}/${scope.clientId}/`))throw fail(404,'Medical history file not found in this chart.');
 return doc;
}
async function audit(req,scope,actionType,documentId){await PhiDocumentAuditLog.create({documentId,clientId:scope.clientId,action:actionType==='client_chart_history_uploaded'?'uploaded':actionType==='client_chart_history_viewed'?'viewed':'scan_requested',actorUserId:req.user.id,ipAddress:req.ip||null,metadata:{source:'private_client_medical_history',actionType,agencyId:scope.agencyId}});}
export async function uploadChartHistory(req,scope,file){
 if(!file?.buffer?.length||file.buffer.length>25*1024*1024||file.mimetype!=='application/pdf'||file.buffer.subarray(0,5).toString()!=='%PDF-')throw fail(400,'Choose a readable PDF volume up to 25 MB.');
 if(req.body?.identityConfirmed!=='true')throw fail(400,'Confirm this PDF belongs to the selected client.');
 if(!DocumentEncryptionService.isConfigured())throw fail(503,'Protected document encryption is unavailable. No medical history was uploaded.');
 let pdf;try{pdf=await PDFDocument.load(file.buffer,{updateMetadata:false});}catch{throw fail(400,'Export an unlocked, readable medical history PDF.');}
 if(!pdf.getPageCount()||pdf.getPageCount()>5000)throw fail(400,'Use a PDF containing 1 to 5,000 pages.');
 const digest=createHash('sha256').update(file.buffer).digest('hex');
 const storagePath=`private-chart-history/${scope.agencyId}/${scope.clientId}/${digest}.enc`;
 return withHistoricalImportLock(scope.agencyId,scope.clientId,'archive',async()=>{
  const existing=await ClientPhiDocument.findByStoragePath(storagePath,{includePrivateHistory:true});
  if(existing){if(existing.removed_at||existing.document_type!==HISTORY_TYPE||Number(existing.client_id)!==scope.clientId||Number(existing.agency_id)!==scope.agencyId)throw fail(409,'This archive upload needs review.');await audit(req,scope,'client_chart_history_uploaded',existing.id);return{document:historyPresentation(existing),reused:true};}
  const scanned=await scanSessionMaterial(file.buffer);
  if(scanned.status==='infected')throw fail(400,'This file failed the private security check. Export a clean PDF and retry.');
  const originalName=StorageService.sanitizeFilename(file.originalname||'medical-history.pdf').slice(0,180);
  const title=String(req.body.documentTitle||'Medical history PDF').slice(0,255);
  const encryption=await DocumentEncryptionService.encryptBuffer(file.buffer,{aad:DocumentEncryptionService.medicalHistoryAad({...scope,originalName})});
  const bucket=await StorageService.getGCSBucket();const object=bucket.file(storagePath);let doc;
  await object.save(encryption.encryptedBuffer,{resumable:false,contentType:'application/octet-stream',metadata:{cacheControl:'no-store'}});
  try{
   doc=await ClientPhiDocument.create({...scope,schoolOrganizationId:null,storagePath,originalName,documentTitle:title,documentType:HISTORY_TYPE,mimeType:'application/pdf',uploadedByUserId:req.user.id,
    isEncrypted:true,encryptionKeyId:encryption.encryptionKeyId,encryptionWrappedKey:encryption.encryptionWrappedKeyB64,encryptionIv:encryption.encryptionIvB64,encryptionAuthTag:encryption.encryptionAuthTagB64,encryptionAlg:encryption.encryptionAlg,
    scanStatus:scanned.status,scanResult:scanned.reason||null,scannedAt:scanned.status==='clean'?new Date():null,quarantinePath:scanned.status==='clean'?null:storagePath});
  }catch(error){await object.delete().catch(()=>{});throw error;}
  await audit(req,scope,'client_chart_history_uploaded',doc.id);
  if(scanned.status==='pending')await queuePrivatePacketScan({doc,clientId:scope.clientId,actorId:req.user.id,kind:'chart_history'});
  return{document:historyPresentation(doc)};
 });
}
export async function viewChartHistory(req,scope,id){
 const doc=await getDocument(scope,id);
 if(doc.scan_status!=='clean'||doc.quarantine_path)throw fail(423,'This PDF is protected while its private file check is pending. Refresh or retry the file check.');
 const bytes=await StorageService.readObject(doc.storage_path);
 const body=await DocumentEncryptionService.decryptPhiDocumentBuffer(doc,bytes);
 await audit(req,scope,'client_chart_history_viewed',doc.id);
 return{body};
}
export async function checkChartHistory(req,scope,id){
 const doc=await getDocument(scope,id);
 if(doc.scan_status==='clean'||doc.scan_status==='infected')return{document:historyPresentation(doc)};
 await audit(req,scope,'client_chart_history_check_requested',doc.id);
 const result=await queuePrivatePacketScan({doc,clientId:scope.clientId,actorId:req.user.id,kind:'chart_history'});
 return{document:historyPresentation(doc),message:result?.message||'Private file scanning is unavailable. This file stays protected until scanning is restored.'};
}
/** Runs only inside the private scanner job. Bind the lease, client and agency before decrypting. */
export async function scanPrivateChartHistory({clientId,documentId,marker},{scan,db=pool,documents=ClientPhiDocument,storage=StorageService,encryption=DocumentEncryptionService}={}){
 if(!Number.isSafeInteger(clientId)||clientId<1||!Number.isSafeInteger(documentId)||documentId<1||!/^private_scan_queued:\d+:[a-f0-9-]+$/.test(String(marker||''))||typeof scan!=='function')throw fail(400,'Invalid private history check.');
 const doc=await documents.findById(documentId,{includePrivateHistory:true});
 if(!doc||doc.removed_at||Number(doc.client_id)!==clientId||doc.document_type!==HISTORY_TYPE||Number(doc.is_encrypted)!==1||doc.scan_status!=='pending'||doc.scan_result!==marker||!String(doc.storage_path).startsWith(`private-chart-history/${doc.agency_id}/${clientId}/`))return{status:'skipped'};
 const stored=await storage.readObject(doc.storage_path);const bytes=await encryption.decryptPhiDocumentBuffer(doc,stored);const result=await scan(bytes);
 if(!['clean','infected','pending'].includes(result?.status))throw Error('Invalid private scanner result.');
 const[changed]=await db.execute(`UPDATE client_phi_documents SET scan_status=?,scan_result=?,scanned_at=?,quarantine_path=? WHERE id=? AND client_id=? AND agency_id=? AND document_type=? AND is_encrypted=1 AND scan_status='pending' AND scan_result=? AND storage_path=? AND removed_at IS NULL`,
 [result.status,result.reason||null,result.status==='pending'?null:new Date(),result.status==='clean'?null:doc.storage_path,documentId,clientId,doc.agency_id,HISTORY_TYPE,marker,doc.storage_path]);
 return{status:changed.affectedRows?result.status:'skipped'};
}
