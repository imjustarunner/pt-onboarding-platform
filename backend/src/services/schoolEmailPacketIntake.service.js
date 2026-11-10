import {createHash,randomUUID} from 'node:crypto';
import pool from '../config/database.js';
import {emailedPacketClientName,emailedPacketIntent,packetFileIsSupported,packetHasOtherRequest,schoolPacketReceiptBody} from '../utils/schoolEmailPacketIntake.shared.js';
import {currentSupportEmailText} from '../utils/supportEmailDraft.shared.js';
import {encryptSupportEmailText} from './supportEmailEncryption.js';
import {emailHash} from './supportTicketEmailPolicy.js';
import {replyMessageIds} from '../utils/emailThreading.js';
const parse=v=>typeof v==='string'?JSON.parse(v):v||{};
const sha=v=>createHash('sha256').update(v).digest('hex');

/** Email staff are resolved to their own active school account, never an admin substitute. */
export async function lookupEmailedPacketStaff({agencyId,ticket,fromEmail,subject,body},db=pool){
  const [rows]=await db.execute(`SELECT DISTINCT u.id,u.role,u.first_name,u.last_name,u.email,u.work_email,
    a.id school_id,a.name school_name,a.slug school_slug
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.is_active=1
    JOIN agencies a ON a.id=ua.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    JOIN organization_affiliations oa ON oa.organization_id=a.id AND oa.agency_id=? AND oa.is_active=1
    WHERE u.role='school_staff' AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND a.organization_type IN ('school','program')
      AND (LOWER(TRIM(u.email))=? OR LOWER(TRIM(u.work_email))=?)`,[agencyId,fromEmail,fromEmail]);
  const sameSchool=rows.filter(r=>Number(r.school_id)===Number(ticket.school_organization_id));
  const namedSchool=rows.filter(r=>`${subject}\n${currentSupportEmailText(body)}`.toLowerCase().includes(String(r.school_name).toLowerCase()));
  const candidates=ticket.school_organization_id?sameSchool:namedSchool.length?namedSchool:rows;
  return candidates.length===1?candidates[0]:null;
}

async function invoke(handler,req){let status=200,result,failure;const res={status(n){status=n;return this;},json(v){result=v;return this;}};await handler(req,res,e=>{failure=e;});if(failure)throw failure;return {status,data:result};}
async function portalUpload({staff,attachment,buffer,name,trace,receivedAt}){
  const {uploadReferralPacket}=await import('../controllers/referralUpload.controller.js');
  const user={id:staff.id,role:'school_staff',first_name:staff.first_name,last_name:staff.last_name,email:staff.email};
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(receivedAt));
  const result=await invoke(uploadReferralPacket[1],{params:{slug:staff.school_slug},user,file:{buffer,originalname:attachment.file_name,mimetype:attachment.mime_type},headers:{},body:{...name,submissionDate:date,uploadNote:trace}});
  if(result.status>=400||!result.data?.draftId||!result.data?.phiDocumentId||!result.data?.taskId)throw Object.assign(new Error('Packet upload/processing task did not finish'),{code:'SCHOOL_EMAIL_PACKET_UPLOAD_INCOMPLETE'});
  return {...result.data,user};
}
async function portalSubmit({staff,upload,name}){
  const {submitReferralPacketDraft}=await import('../controllers/referralUpload.controller.js');
  const result=await invoke(submitReferralPacketDraft,{params:{slug:staff.school_slug},user:upload.user,headers:{},emailPacketReceipt:true,body:{draftId:upload.draftId,...name}});
  return result.status<400?{clientId:result.data?.clientId||null}: {needsReview:true,reason:result.data?.error?.code||'packet_processing_needs_review'};
}

/** Uploads are idempotent by current file + school + explicit client name. A pending
 * or ambiguous delivery is never automatically sent again. */
export async function processSchoolEmailPacket(input,dependencies={}){
 const db=dependencies.database||pool;
 if(!emailedPacketIntent(input.subject,input.bodyText))return {handled:false};
 const [[agency]]=await db.execute('SELECT feature_flags FROM agencies WHERE id=?',[input.agencyId]);
 const flags=parse(agency?.feature_flags);
 const received=Date.parse(input.receivedAt),enabled=Date.parse(flags.schoolEmailPacketIntakeEnabledAt);
 if(flags.schoolEmailPacketIntakeEnabled!==true||!Number.isFinite(received)||!Number.isFinite(enabled)||received<enabled)return {handled:false};
 if(input.headers?.autoSubmitted&&input.headers.autoSubmitted!=='no')return {handled:false};
 const name=emailedPacketClientName(input.subject,input.bodyText);if(!name)return {handled:false,reason:'client_name_needs_review'};
 const [[ticket]]=await db.execute('SELECT * FROM support_tickets WHERE id=? AND agency_id=?',[input.ticketId,input.agencyId]);
 if(!ticket||ticket.source_channel!=='email'||ticket.topic==='technology')return {handled:false};
 const staff=await (dependencies.lookupStaff||lookupEmailedPacketStaff)({agencyId:input.agencyId,ticket,fromEmail:String(input.fromEmail).toLowerCase(),subject:input.subject,body:input.bodyText},db);
 if(!staff)return {handled:false,reason:'school_sender_or_school_needs_review'};
 const [schoolAddresses]=await db.execute('SELECT LOWER(itsco_email) email FROM school_profiles WHERE school_organization_id=?',[staff.school_id]);
 const recipientAddresses=(input.recipients||[]).map(v=>String(v.email||v).trim().toLowerCase());
 if(!recipientAddresses.some(e=>['schools@itsco.health','support@itsco.health',...schoolAddresses.map(s=>s.email)].includes(e)))return {handled:false,reason:'packet_recipient_needs_review'};
 const list=dependencies.listAttachments||(await import('./unifiedEmail/ticketInboundAttachments.service.js')).listTicketAttachments;
 const files=(await list(input.ticketId,db)).filter(a=>Number(a.support_ticket_message_id)===Number(input.sourceMessageId)&&['application/pdf','image/png','image/jpeg','image/jpg'].includes(a.mime_type));
 if(files.length!==1)return {handled:false,reason:'packet_files_need_review'};
 const attachment=files[0];const read=dependencies.readAttachment||(await import('./unifiedEmail/ticketInboundAttachments.service.js')).readTicketAttachmentBuffer;
 const buffer=await read(attachment);if(!packetFileIsSupported(buffer,attachment.mime_type))return {handled:false,reason:'packet_file_needs_review'};
 const packetKey=sha(Buffer.concat([Buffer.from(`${input.agencyId}:${staff.school_id}:${name.firstName.toLowerCase()}:${name.lastName.toLowerCase()}:`),buffer]));
 const conn=await db.getConnection();let locked=false;
 try{
  const [[lock]]=await conn.execute('SELECT GET_LOCK(?,5) acquired',[`school-packet:${packetKey.slice(0,48)}`]);if(Number(lock?.acquired)!==1)throw Error('Packet upload is busy');locked=true;
  await conn.execute(`INSERT IGNORE INTO school_email_packet_receipts (agency_id,school_organization_id,ticket_id,source_message_id,attachment_id,sender_user_id,packet_key) VALUES (?,?,?,?,?,?,?)`,[input.agencyId,staff.school_id,input.ticketId,input.sourceMessageId,attachment.id,staff.id,packetKey]);
  let [[receipt]]=await conn.execute('SELECT * FROM school_email_packet_receipts WHERE agency_id=? AND packet_key=?',[input.agencyId,packetKey]);
  if(!receipt)throw Error('Packet receipt scope changed');
  if(receipt.ticket_id!==Number(input.ticketId)||receipt.source_message_id!==Number(input.sourceMessageId))return {handled:true,uploaded:receipt.status==='uploaded',duplicate:true,receiptId:receipt.id,ackSent:receipt.ack_status==='sent',needsReply:packetHasOtherRequest(input.bodyText)};
  if(receipt.status==='upload_started')return {handled:false,reason:'packet_upload_outcome_needs_review'};
  if(!receipt.referral_draft_id){
   // A previously executed human action owns this file; never upload a second copy.
   const [actions]=await conn.execute(`SELECT result_json FROM support_ticket_action_items WHERE ticket_id=? AND action_type='upload_school_packet' AND status='completed' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.attachmentId'))=? LIMIT 1`,[input.ticketId,String(attachment.id)]);
   if(actions.length)return {handled:false,reason:'packet_already_handled_by_staff'};
   await conn.execute("UPDATE school_email_packet_receipts SET status='upload_started' WHERE id=?",[receipt.id]);
   const upload=await (dependencies.upload||portalUpload)({staff,attachment,buffer,name,trace:`Email packet receipt ${receipt.id} from support ticket ${input.ticketId}`,receivedAt:input.receivedAt});
   await conn.execute(`UPDATE school_email_packet_receipts SET referral_draft_id=?,phi_document_id=?,processing_task_id=?,status='uploaded' WHERE id=?`,[upload.draftId,upload.phiDocumentId,upload.taskId,receipt.id]);
   await conn.execute('UPDATE support_tickets SET school_organization_id=COALESCE(school_organization_id,?) WHERE id=? AND agency_id=?',[staff.school_id,input.ticketId,input.agencyId]);
   let submitted;
   try{submitted=await (dependencies.submit||portalSubmit)({staff,upload,name});}catch{submitted={needsReview:true,reason:'packet_processing_needs_review'};}
   if(submitted?.clientId){await conn.execute('UPDATE school_email_packet_receipts SET client_id=? WHERE id=?',[submitted.clientId,receipt.id]);await conn.execute('UPDATE support_tickets SET client_id=COALESCE(client_id,?) WHERE id=? AND agency_id=?',[submitted.clientId,input.ticketId,input.agencyId]);}
   if(submitted?.needsReview)await conn.execute('UPDATE school_email_packet_receipts SET error_code=? WHERE id=?',[submitted.reason,receipt.id]);
   [[receipt]]=await conn.execute('SELECT * FROM school_email_packet_receipts WHERE id=?',[receipt.id]);
  }
  let ack={sent:receipt.ack_status==='sent'};
  if(receipt.ack_status==='pending')ack=await (dependencies.sendReceipt||sendSchoolEmailPacketReceipt)({receipt,ticket,staff,source:input,database:db});
  return {handled:true,uploaded:true,receiptId:receipt.id,draftId:receipt.referral_draft_id,clientId:receipt.client_id,ackSent:!!ack.sent,needsReply:packetHasOtherRequest(input.bodyText)||!ack.sent};
 }finally{if(locked)await conn.execute('SELECT RELEASE_LOCK(?)',[`school-packet:${packetKey.slice(0,48)}`]).catch(()=>{});conn.release();}
}

export async function sendSchoolEmailPacketReceipt({receipt,ticket,source,database:db=pool},dependencies={}){
 const [identities]=await db.execute(`SELECT * FROM email_sender_identities WHERE agency_id=? AND is_active=1 AND LOWER(from_email) IN ('schools@itsco.health','support@itsco.health')`,[receipt.agency_id]);
 const [schoolAddresses]=await db.execute('SELECT LOWER(itsco_email) email FROM school_profiles WHERE school_organization_id=?',[receipt.school_organization_id]);
 const recipients=(source.recipients||[]).map(v=>String(v.email||v).toLowerCase());
 const schoolGroup=schoolAddresses.some(s=>recipients.includes(s.email));
 const preferred=schoolGroup?'schools@itsco.health':recipients.find(e=>['schools@itsco.health','support@itsco.health'].includes(e))||'schools@itsco.health';
 const identity=identities.find(i=>String(i.from_email).toLowerCase()===preferred);if(!identity)return {sent:false};
 const parentId=replyMessageIds(source.messageId)[0]||null;
 const body=schoolPacketReceiptBody(),enc=encryptSupportEmailText(body),requestKey=sha(`school-email-packet-receipt:${receipt.id}`),internetId=`<${randomUUID()}@itsco.health>`;
 const conn=await db.getConnection();let messageId,deliveryId;
 try{await conn.beginTransaction();const [claim]=await conn.execute("UPDATE school_email_packet_receipts SET ack_status='sending' WHERE id=? AND status='uploaded' AND ack_status='pending'",[receipt.id]);if(!claim.affectedRows){await conn.rollback();return {sent:false};}
  const [message]=await conn.execute(`INSERT INTO support_ticket_messages (ticket_id,author_role,body,body_ciphertext,body_iv,body_auth_tag,encryption_key_id,is_internal) VALUES (?,'system_email_outbound',?,?,?,?,?,0)`,[ticket.id,enc.plain,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);messageId=message.insertId;
  const [delivery]=await conn.execute(`INSERT INTO support_ticket_email_messages (ticket_id,ticket_message_id,agency_id,direction,send_status,sender_identity_id,from_email,from_name,to_json,subject,internet_message_id,internet_message_id_hash,in_reply_to,references_header,gmail_thread_id,client_request_key) VALUES (?,?,?,'outbound','sending',?,?,?,?,?,?,?,?,?,?,?)`,[ticket.id,messageId,receipt.agency_id,identity.id,identity.from_email,identity.display_name,JSON.stringify([source.fromEmail]),/^re:/i.test(source.subject)?source.subject:`Re: ${source.subject||'Your packet'}`,internetId,emailHash(internetId),parentId,parentId,ticket.source_email_thread_id,requestKey]);deliveryId=delivery.insertId;
  await conn.execute('UPDATE school_email_packet_receipts SET ack_ticket_message_id=? WHERE id=?',[messageId,receipt.id]);await conn.commit();
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 const review=dependencies.review||await import('./supportReplyReview.service.js');let sent,status='unknown';
 try{
  await review.captureSentReview({ticketId:ticket.id,agencyId:receipt.agency_id,actorUserId:null,body,composedBody:body,deliveryStatus:'sending',sourceMessageId:source.sourceMessageId,ticketMessageId:messageId,internetMessageId:internetId,idempotencyKey:`packet-receipt:${receipt.id}`});
  const send=dependencies.send||(await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity;
  sent=await send({senderIdentityId:identity.id,to:source.fromEmail,subject:/^re:/i.test(source.subject)?source.subject:`Re: ${source.subject||'Your packet'}`,text:body,source:'auto',generatedByUserId:null,templateType:'school_email_packet_receipt',templateId:receipt.id,clientId:receipt.client_id||null,schoolOrganizationId:receipt.school_organization_id,replyToOverride:identity.from_email,fromDisplayNameOverride:identity.display_name,inReplyTo:parentId,references:parentId,threadId:ticket.source_email_thread_id,internetMessageIdOverride:internetId});
  status=sent?.id&&!sent.skipped&&!sent.blocked&&!sent.queued&&!sent.redirected?'sent':sent?.queued?'queued':'failed';
 }catch{/* A provider may have accepted an interrupted request; never send it twice. */}
 await db.execute('UPDATE school_email_packet_receipts SET ack_status=?,communication_id=?,transport_message_id=? WHERE id=?',[status,sent?.communicationId||null,sent?.id||null,receipt.id]);
 const actualInternetId=sent?.internetMessageId||internetId;
 await db.execute('UPDATE support_ticket_email_messages SET send_status=?,communication_id=?,gmail_message_id=?,internet_message_id=?,internet_message_id_hash=?,sent_at=? WHERE id=?',[status,sent?.communicationId||null,sent?.id||null,actualInternetId,emailHash(actualInternetId),status==='sent'?new Date():null,deliveryId]);
 if(status==='sent'&&sent.bodyText){const actual=encryptSupportEmailText(sent.bodyText);await db.execute('UPDATE support_ticket_messages SET body=?,body_ciphertext=?,body_iv=?,body_auth_tag=?,encryption_key_id=? WHERE id=?',[actual.plain,actual.ciphertext,actual.iv,actual.authTag,actual.keyId,messageId]);}
 if(status==='sent')await review.captureSentReview({ticketId:ticket.id,agencyId:receipt.agency_id,actorUserId:null,body:sent.bodyText||body,composedBody:body,deliveryStatus:'sent',sourceMessageId:source.sourceMessageId,ticketMessageId:messageId,internetMessageId:sent.internetMessageId||internetId,communicationId:sent.communicationId,transportMessageId:sent.id,idempotencyKey:`packet-receipt:${receipt.id}`}).catch(()=>{});
 return {sent:status==='sent',status};
}
