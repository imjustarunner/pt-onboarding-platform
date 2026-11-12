import {createHash} from 'node:crypto';
import pool from '../config/database.js';
import StorageService from './storage.service.js';
import {encryptChatText,decryptChatText,isChatEncryptionConfigured} from './chatEncryption.service.js';
import {ticketAttachmentType} from '../utils/ticketAttachmentType.js';
import {CLIENT_DOCUMENT_MAX_BYTES} from '../utils/clientDocumentUpload.js';
import {logAuditEvent} from './auditEvent.service.js';
const format='auricwell-ticket-attachment/v1';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function encryptSupportAttachment(buffer,{ticketId,agencyId}){
 return Buffer.from(JSON.stringify({format,...encryptChatText(JSON.stringify({ticketId:Number(ticketId),agencyId:Number(agencyId),bytes:buffer.toString('base64')}))}));
}
export function decryptSupportAttachment(buffer,{ticketId,agencyId}){
 const envelope=JSON.parse(buffer.toString('utf8'));if(envelope.format!==format)throw fail(409,'The attachment format could not be verified.');
 const payload=JSON.parse(decryptChatText(envelope));if(Number(payload.ticketId)!==Number(ticketId)||Number(payload.agencyId)!==Number(agencyId)||typeof payload.bytes!=='string')throw fail(409,'The attachment does not belong to this ticket.');return Buffer.from(payload.bytes,'base64');
}
const publicFile=row=>{const {file_path,...value}=row;return {...value,is_pdf:value.mime_type==='application/pdf'};};
export async function persistSupportTicketAttachment({req,ticket,file},overrides={}){
 const deps={db:pool,storage:StorageService,encrypt:encryptSupportAttachment,configured:isChatEncryptionConfigured,audit:logAuditEvent,...overrides};
 if(!file?.buffer?.length)throw fail(400,'Choose a PDF, JPEG or PNG file.');
 if(file.buffer.length>CLIENT_DOCUMENT_MAX_BYTES)throw fail(413,'Each file must be 25 MB or smaller.');
 const detected=ticketAttachmentType(file.buffer,String(file.originalname||'attachment').replace(/[\x00-\x1f\x7f]/g,'_').slice(0,245));
 if(!['application/pdf','image/jpeg','image/png'].includes(detected.mimeType)||detected.mimeType!==String(file.mimetype).replace('image/jpg','image/jpeg'))throw fail(400,'The file contents must match its PDF, JPEG or PNG type.');
 if(!deps.configured())throw fail(503,'Private attachment storage is unavailable. Keep your file and try again after Support checks its configuration.');
 const digest=createHash('sha256').update(String(ticket.id)).update(':').update(String(req.user.id)).update(':').update(detected.filename).update(':').update(file.buffer).digest('hex');
 const path=`private-ticket-attachments/${Number(ticket.agency_id)}/${Number(ticket.id)}/${digest}.ticket.enc`;
 const connection=await deps.db.getConnection(),lock=`ticket-file:${digest.slice(0,48)}`;let acquired=false;
 try{
  const [[claim]]=await connection.execute('SELECT GET_LOCK(?,5) AS acquired',[lock]);acquired=Number(claim?.acquired)===1;if(!acquired)throw fail(409,'This file is already being added. Refresh the ticket files before retrying.');
  const [[prior]]=await connection.execute('SELECT id,ticket_id,file_name,mime_type,file_size,created_at FROM support_ticket_attachments WHERE ticket_id=? AND uploaded_by_user_id=? AND file_path=? LIMIT 1',[ticket.id,req.user.id,path]);if(prior)return publicFile(prior);
  const [[count]]=await connection.execute('SELECT COUNT(*) AS count FROM support_ticket_attachments WHERE ticket_id=?',[ticket.id]);if(Number(count?.count)>=100)throw fail(409,'This ticket has reached its file limit. Contact Support for assistance.');
  const encrypted=deps.encrypt(file.buffer,{ticketId:ticket.id,agencyId:ticket.agency_id});
  await deps.storage.writeObject(path,encrypted,'application/octet-stream',{cacheControl:'private, no-store'});
  // Bind the insert to the exact persisted ticket scope. A network error may
  // occur after commit: keep encrypted bytes for reconciliation/retry rather
  // than deleting an object which a successfully inserted row already owns.
  const [saved]=await connection.execute('INSERT INTO support_ticket_attachments (ticket_id,uploaded_by_user_id,file_name,file_path,mime_type,file_size) SELECT id,?,?,?,?,? FROM support_tickets WHERE id=? AND agency_id <=> ? AND school_organization_id <=> ? AND created_by_user_id <=> ?',[req.user.id,detected.filename,path,detected.mimeType,file.buffer.length,ticket.id,ticket.agency_id??null,ticket.school_organization_id??null,ticket.created_by_user_id??null]);
  if(Number(saved.affectedRows)!==1){await deps.storage.deleteObject(path).catch(()=>{});throw fail(409,'The ticket context changed. Refresh its files before retrying.');}
  const id=Number(saved.insertId);
  await deps.audit(req,{actionType:'support_ticket_attachment_uploaded',agencyId:ticket.agency_id,targetType:'support_ticket',targetId:ticket.id,metadata:{attachmentId:id,fileSize:file.buffer.length,mimeType:detected.mimeType}});
  return publicFile({id,ticket_id:Number(ticket.id),file_name:detected.filename,mime_type:detected.mimeType,file_size:file.buffer.length,uploaded_by_user_id:Number(req.user.id),created_at:new Date().toISOString()});
 }finally{try{if(acquired)await connection.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{connection.release();}}
}
