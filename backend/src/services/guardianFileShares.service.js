import crypto from 'node:crypto';
import {listClientServices,clientAgencyMembership} from './clientServiceEnrollment.service.js';
import pool from '../config/database.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { authorizedClient } from './guardianAppointments.service.js';
import { requireClinicalScope } from './guardianClinicalAccess.service.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import StorageService from './storage.service.js';
import DocumentEncryptionService from './documentEncryption.service.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const roles=['super_admin','admin','agency_admin','support','staff','provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant'];
export const fileKeyHash=doc=>crypto.createHash('sha256').update(String(doc.storage_path)).digest('hex');
export function shareableFile(doc) {
 return !!doc&&!doc.removed_at&&(!doc.expires_at||+new Date(doc.expires_at)>Date.now())
  && (!doc.scan_status||doc.scan_status==='clean')&&!doc.quarantine_path
  && ['application/pdf','image/jpeg','image/png','text/plain'].includes(doc.mime_type);
}
async function staffAccess(user,clientId){if(!roles.includes(user.role))fail(403,'Care-team document access required.');const access=await resolveClientRecordAccess({userId:user.id,role:user.role,clientId});if(!access.ok)fail(access.status||403,'Client access denied.');return access.client;}
export async function recipientFileAccess(userId,clientId,careContext={}){
 const client=await authorizedClient(userId,clientId,'clinical_documents',careContext);
 if(client.permissions_json?.canViewDocs===false)fail(403,'Documents are not shared with this account.');
 const services=careContext.agencyId?await listClientServices(clientId,client.agency_id):[];
 if(services.some(s=>s.service_kind==='counseling'&&s.is_active)||!['learning','tutoring'].includes(String(client.client_type).toLowerCase()))await requireClinicalScope({agencyId:client.agency_id,clientId,userId,scope:'clinical_documents'});
 return client;
}
export async function fileShareRecipients(user,documentId){
 const doc=await ClientPhiDocument.findById(documentId);if(!doc)fail(404,'Document not found.');await staffAccess(user,doc.client_id);await fileAgencyAccess(user,doc);
 const [links]=await pool.execute(`SELECT cg.guardian_user_id,u.first_name,u.last_name FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=? AND cg.access_enabled=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0`,[doc.client_id]);
 const [shares]=await pool.execute('SELECT recipient_user_id,revoked_at,file_key_hash FROM family_portal_file_shares WHERE document_id=?',[documentId]);
 const recipients=[];for(const l of links){try{await recipientFileAccess(l.guardian_user_id,doc.client_id,{agencyId:doc.agency_id});recipients.push({id:l.guardian_user_id,name:[l.first_name,l.last_name].filter(Boolean).join(' '),shared:shares.some(s=>Number(s.recipient_user_id)===Number(l.guardian_user_id)&&!s.revoked_at&&s.file_key_hash===fileKeyHash(doc))});}catch(e){if(e.status!==403)throw e;}}
 return {recipients,shareable:shareableFile(doc)};
}
export async function setFileShare(user,documentId,{recipientId,shared,reviewed}){
 const doc=await ClientPhiDocument.findById(documentId);if(!doc)fail(404,'Document not found.');await staffAccess(user,doc.client_id);
 if(!Number.isSafeInteger(Number(recipientId))||Number(recipientId)<1)fail(400,'Choose a recipient.');
 if(shared&&(reviewed!==true||!shareableFile(doc)))fail(400,'Review this file and confirm it is appropriate for the selected recipient.');
 await fileAgencyAccess(user,doc);
 if(shared){await recipientFileAccess(Number(recipientId),doc.client_id,{agencyId:doc.agency_id});
  await pool.execute(`INSERT INTO family_portal_file_shares(document_id,client_id,agency_id,recipient_user_id,shared_by_user_id,file_key_hash) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE shared_by_user_id=VALUES(shared_by_user_id),file_key_hash=VALUES(file_key_hash),shared_at=CURRENT_TIMESTAMP,revoked_at=NULL`,[doc.id,doc.client_id,doc.agency_id,Number(recipientId),user.id,fileKeyHash(doc)]);
 }else await pool.execute('UPDATE family_portal_file_shares SET revoked_at=UTC_TIMESTAMP() WHERE document_id=? AND recipient_user_id=?',[doc.id,Number(recipientId)]);
 await PhiDocumentAuditLog.create({documentId:doc.id,clientId:doc.client_id,action:shared?'portal_shared':'portal_share_revoked',actorUserId:user.id,metadata:{recipientUserId:Number(recipientId)}});
 return {saved:true};
}
export async function listSharedFiles(userId,clientId,careContext={}){
 const client=await recipientFileAccess(userId,clientId,careContext);
 const [rows]=await pool.execute(`SELECT d.*,s.id AS share_id,s.shared_at,s.file_key_hash FROM family_portal_file_shares s JOIN client_phi_documents d ON d.id=s.document_id AND d.client_id=s.client_id AND d.agency_id=s.agency_id WHERE s.recipient_user_id=? AND s.client_id=? AND s.agency_id=? AND s.revoked_at IS NULL ORDER BY s.shared_at DESC`,[userId,clientId,client.agency_id]);
 return rows.filter(r=>shareableFile(r)&&r.file_key_hash===fileKeyHash(r)).map(r=>({id:r.share_id,title:r.document_title||r.original_name||'Shared document',type:r.document_type,mimeType:r.mime_type,sharedAt:r.shared_at}));
}
export async function sharedFile(userId,clientId,shareId,careContext={}){
 const client=await recipientFileAccess(userId,clientId,careContext);
 const [[doc]]=await pool.execute(`SELECT d.*,s.file_key_hash FROM family_portal_file_shares s JOIN client_phi_documents d ON d.id=s.document_id AND d.client_id=s.client_id AND d.agency_id=s.agency_id WHERE s.id=? AND s.recipient_user_id=? AND s.client_id=? AND s.agency_id=? AND s.revoked_at IS NULL`,[shareId,userId,clientId,client.agency_id]);
 if(!shareableFile(doc)||doc.file_key_hash!==fileKeyHash(doc))fail(404,'Shared file is no longer available.');
 const stored=await StorageService.readObject(doc.storage_path);
 const body=doc.is_encrypted?await DocumentEncryptionService.decryptReferralPacketBuffer({encryptedBuffer:stored,encryptionKeyId:doc.encryption_key_id,encryptionWrappedKeyB64:doc.encryption_wrapped_key,encryptionIvB64:doc.encryption_iv,encryptionAuthTagB64:doc.encryption_auth_tag,organizationId:doc.school_organization_id,originalName:doc.original_name||'',sanitizeFilename:n=>StorageService.sanitizeFilename(n)}):stored;
 await PhiDocumentAuditLog.create({documentId:doc.id,clientId,action:'portal_downloaded',actorUserId:userId});
 return {body,type:doc.mime_type,name:StorageService.sanitizeFilename(doc.original_name||`document-${doc.id}`)};
}

async function fileAgencyAccess(user,doc){
 if(!await clientAgencyMembership(doc.client_id,doc.agency_id))fail(403,'Document agency is no longer active for this client.');
 if(user.role==='super_admin')return;
 const [[member]]=await pool.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND COALESCE(is_active,1)=1',[user.id,doc.agency_id]);
 if(!member)fail(403,'Document agency access required.');
}
