import {createHash} from 'node:crypto';
import pool from '../config/database.js';
import {encryptSupportEmailText} from './supportEmailEncryption.js';
import {decryptTicketRow} from '../utils/supportTicketCrypto.js';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export async function listAgencyForwardProviders(agencyId,db=pool){
 const [rows]=await db.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.role FROM users u
  JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
  WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')
   AND (u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','facilitator') OR ua.has_provider_access=1 OR (u.role IN ('admin','super_admin') AND u.sees_clients=1))
   AND u.role NOT IN ('school_staff','client_guardian') ORDER BY u.last_name,u.first_name`,[agencyId]);return rows;
}
export async function ticketForwardHistory(ticket,db=pool){
 const [rows]=await db.execute(`SELECT id,created_at,metadata FROM user_activity_log WHERE agency_id=?
  AND action_type='support_ticket_forwarded' AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.ticketId'))=? ORDER BY id DESC LIMIT 30`,[ticket.agency_id,String(ticket.id)]);
 return rows.map(r=>({...r,...(typeof r.metadata==='string'?JSON.parse(r.metadata):r.metadata),metadata:undefined}));
}
/** Private handoff to each provider's own Messages inbox. It never sends the
 * original inquiry as an email or grants access to the support queue. */
export async function forwardTicketToProviderInboxes(input,dependencies={}){
 const {ticketId,actorUserId,note='',requestId}=input;
 const ids=[...new Set((input.providerUserIds||[]).map(Number))];
 if(!ids.length||ids.length>10||ids.some(id=>!Number.isSafeInteger(id)||id<1)||!requestId||String(requestId).length>200)throw fail('Choose up to ten providers and retry with a forwarding request ID.');
 if(String(note).length>10000)throw fail('Keep the forward introduction under 10,000 characters.');
 const payloadHash=createHash('sha256').update(JSON.stringify([ids,String(note).trim()])).digest('hex');
 const database=dependencies.database||pool,db=await database.getConnection();let result;
 try{
  await db.beginTransaction();
  const [[ticket]]=await db.execute('SELECT * FROM support_tickets WHERE id=? FOR UPDATE',[ticketId]);if(!ticket)throw fail('Ticket not found',404);
  const key=createHash('sha256').update(`${actorUserId}:${requestId}`).digest('hex');
  const [previous]=await db.execute(`SELECT metadata FROM user_activity_log WHERE agency_id=? AND action_type='support_ticket_forwarded'
   AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.ticketId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.requestKey'))=? LIMIT 1`,[ticket.agency_id,String(ticketId),key]);
  if(previous.length){const saved=typeof previous[0].metadata==='string'?JSON.parse(previous[0].metadata):previous[0].metadata;if(saved.payloadHash!==payloadHash)throw fail('The forwarding request changed. Refresh before trying again.',409);await db.rollback();return {...saved,duplicate:true};}
  const [[actor]]=await db.execute(`SELECT u.id,u.role,u.first_name,u.last_name,u.work_email,u.email FROM users u
   WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.role IN ('admin','super_admin','support')
   AND (u.role='super_admin' OR EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1))`,[actorUserId,ticket.agency_id]);
  if(!actor)throw fail('Only Support, Admin and Superadmin can forward tickets.',403);
  if(ticket.status==='closed')throw fail('This ticket is already closed.',409);
  if(ticket.claimed_by_user_id&&Number(ticket.claimed_by_user_id)!==Number(actorUserId))throw fail('The assigned owner must forward this ticket.',409);
  const [active]=await db.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1 WHERE u.id IN (${ids.map(()=>'?').join(',')}) AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')`,[ticket.agency_id,...ids]);
  if(ids.some(id=>!active.some(user=>Number(user.id)===id)))throw fail('Choose active providers in this agency.');
  const candidates=await dependencies.providerCandidates(ticket);
  if(ids.some(id=>!candidates.some(p=>Number(p.id)===id)))throw fail('Choose active providers authorized for this ticket.');
  const actorName=[actor.first_name,actor.last_name].filter(Boolean).join(' '),forwarder=actor.work_email||actor.email;
  const original=decryptTicketRow(ticket);if(original.question==='[Unable to decrypt]')throw fail('The original inquiry cannot be read.',503);
  let originalEmail=ticket.source_email_from||'';
  if(!originalEmail&&ticket.created_by_user_id){const [[creator]]=await db.execute('SELECT email,work_email FROM users WHERE id=?',[ticket.created_by_user_id]);originalEmail=creator?.work_email||creator?.email||'';}
  const [attachments]=await db.execute('SELECT a.file_name,a.mime_type,a.file_size,a.file_path FROM support_ticket_attachments a LEFT JOIN support_ticket_messages m ON m.id=a.support_ticket_message_id WHERE a.ticket_id=? AND COALESCE(m.is_internal,0)=0',[ticketId]);
  const forwarded=[];
  for(const id of ids){
   const provider=candidates.find(p=>Number(p.id)===id),name=[provider.first_name,provider.last_name].filter(Boolean).join(' ');
   const inbox=await (dependencies.ensureMailbox||(await import('./personalMailbox.service.js')).ensurePersonalMailbox)({agencyId:ticket.agency_id,userId:id,actorUserId});
   if(!inbox?.id)throw fail('The provider’s Messages inbox is unavailable.',503);
   const body=`This message was forwarded to you by ${actorName}.\n\n${String(note).trim()||`Hi ${provider.first_name||name}, here is a message that came through for you.`}\n\nOriginal sender: ${originalEmail||'See the contact details below'}\nForwarded by: ${forwarder}\nTicket #${ticketId}: ${ticket.subject||'Inquiry'}\n\n${original.question||'(No inquiry text)'}\n\nUse Reply to original sender, Reply to forwarder, or Reply to both. You can respond separately at different times.`;
   const enc=encryptSupportEmailText(body);
   const [message]=await db.execute(`INSERT INTO support_ticket_messages (ticket_id,author_user_id,author_role,body,body_ciphertext,body_iv,body_auth_tag,encryption_key_id,is_internal)
    VALUES (?,?,'support_forward',?,?,?,?,?,1)`,[ticketId,actorUserId,enc.plain,enc.ciphertext,enc.iv,enc.authTag,enc.keyId]);
   const [conversation]=await db.execute(`INSERT INTO communication_conversations (agency_id,inbox_id,channel,subject,owner_user_id,status,last_message_at,last_message_preview)
    VALUES (?,?,'email',?,?,'needs_reply',NOW(),'Support forwarded an inquiry for you')`,[ticket.agency_id,inbox.id,`Forwarded inquiry: ${ticket.subject||`Ticket #${ticketId}`}`.slice(0,255),id]);
   const [forwardMessage]=await db.execute(`INSERT INTO communication_messages (conversation_id,channel,direction,author_user_id,from_json,to_json,cc_json,subject,body_text,support_ticket_message_id,send_status,is_auto_reply,auto_reply_kind,sent_at)
    VALUES (?,'email','inbound',?,?,?,?,?,NULL,?,'received',1,'support_ticket_forward',NOW())`,[conversation.insertId,actorUserId,JSON.stringify({email:forwarder,name:actorName,replyTo:forwarder,forwardedByEmail:forwarder,originalSenderEmail:originalEmail}),JSON.stringify([{email:inbox.from_email}]),JSON.stringify(originalEmail?[{email:originalEmail}]:[]),ticket.subject,message.insertId]);
   for(const file of attachments){await db.execute(`INSERT INTO communication_attachments (message_id,filename,content_type,size_bytes,storage_key) VALUES (?,?,?,?,?)`,[forwardMessage.insertId,file.file_name,file.mime_type,file.file_size,file.file_path]);}
   await db.execute(`INSERT INTO communication_links (conversation_id,entity_type,entity_id,label) VALUES (?,'support_ticket_forward',?,?)`,[conversation.insertId,ticketId,`Forwarded by ${actorName}`]);
   forwarded.push({providerId:id,providerName:name,conversationId:conversation.insertId});
  }
  const close=encryptSupportEmailText(`Closed and forwarded by ${actorName} to ${forwarded.map(p=>p.providerName).join(', ')}.`);
  await db.execute(`UPDATE support_tickets SET status='closed',answered_by_user_id=?,answered_at=NOW(),answer=?,answer_ciphertext=?,answer_iv=?,answer_auth_tag=?,answer_encryption_key_id=? WHERE id=?`,[actorUserId,close.plain,close.ciphertext,close.iv,close.authTag,close.keyId,ticketId]);
  result={ticketId,requestKey:key,payloadHash,forwardedBy:actorName,forwardedTo:forwarded,closed:true};
  await db.execute(`INSERT INTO user_activity_log (action_type,user_id,agency_id,metadata) VALUES ('support_ticket_forwarded',?,?,?)`,[actorUserId,ticket.agency_id,JSON.stringify(result)]);
  await db.commit();
  for(const target of forwarded){const notify=dependencies.notify||(async value=>{const {default:Notification}=await import('../models/Notification.model.js');return Notification.create(value);});
   await notify({type:'support_ticket_forwarded_to_provider',severity:'info',title:'Support forwarded an inquiry to you',message:`${actorName} forwarded an inquiry. Read it and choose who to reply to in My messages.`,userId:target.providerId,agencyId:ticket.agency_id,relatedEntityType:'communication_conversation',relatedEntityId:target.conversationId,actorUserId}).catch(error=>console.warn('[ticket forward] notification pending',error?.code||'notification_failed'));
  }
  return result;
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
