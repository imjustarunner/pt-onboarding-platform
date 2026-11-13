import pool from '../config/database.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import ClinicalDocument from '../models/clinical/ClinicalDocument.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import StorageService from './storage.service.js';
import DocumentEncryptionService from './documentEncryption.service.js';

const type='session_supporting_material';
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const meta=row=>{try{return typeof row.metadata_json==='string'?JSON.parse(row.metadata_json):row.metadata_json||{};}catch{return {};}};
/** Internal authenticated job only: no URLs, bytes or names leave this process. */
export async function scanPrivateClinicalMaterial({clientId,documentId,clinicalSessionId,marker},deps={}) {
  const {db=pool,sessions=ClinicalSession,links=ClinicalDocument,documents=ClientPhiDocument,storage=StorageService,encryption=DocumentEncryptionService,scan}=deps;
  if(![clientId,documentId,clinicalSessionId].every(positive)||!/^private_scan_queued:\d+:[a-f0-9-]+$/.test(String(marker||''))||typeof scan!=='function')throw Error('Invalid private clinical scan request.');
  const session=await sessions.findById(Number(clinicalSessionId));
  const doc=await documents.findById(Number(documentId));
  if(!session||session.is_deleted||Number(session.client_id)!==Number(clientId)
    ||!doc||doc.removed_at||Number(doc.client_id)!==Number(clientId)||Number(doc.agency_id)!==Number(session.agency_id)
    ||doc.document_type!==type||Number(doc.is_encrypted)!==1||doc.scan_status!=='pending'||doc.scan_result!==marker
    ||!String(doc.storage_path||'').startsWith(`clinical-session-materials/${session.agency_id}/${session.id}/`)
    ||(doc.expires_at&&+new Date(doc.expires_at)<=Date.now()))return {status:'skipped'};
  const linked=(await links.listBySession({clinicalSessionId:Number(clinicalSessionId)})).some(row=>!row.is_deleted
    &&row.document_type===type&&Number(row.clinical_session_id)===Number(clinicalSessionId)
    &&Number(row.client_id)===Number(clientId)&&Number(row.agency_id)===Number(session.agency_id)&&Number(meta(row).phiDocumentId)===Number(documentId));
  if(!linked)return {status:'skipped'};
  const encrypted=await storage.readObject(doc.storage_path);
  const bytes=await encryption.decryptPhiDocumentBuffer(doc,encrypted);
  const result=await scan(bytes);
  if(!['clean','infected','pending'].includes(result?.status))throw Error('Invalid private scanner result.');
  const [changed]=await db.execute(`UPDATE client_phi_documents SET scan_status=?,scan_result=?,scanned_at=?,quarantine_path=?
    WHERE id=? AND client_id=? AND agency_id=? AND document_type=? AND is_encrypted=1
      AND scan_status='pending' AND scan_result=? AND storage_path=? AND removed_at IS NULL
      AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())`,
  [result.status,result.reason||null,result.status==='pending'?null:new Date(),result.status==='clean'?null:doc.storage_path,
    Number(documentId),Number(clientId),Number(session.agency_id),type,marker,doc.storage_path]);
  return {status:changed.affectedRows?result.status:'skipped'};
}
