import crypto from 'node:crypto';
import pool from '../config/database.js';
import { encryptBillingSecret,decryptBillingSecret } from './billingEncryption.service.js';
import { encryptChatText,isChatEncryptionConfigured } from './chatEncryption.service.js';
import { decryptTicketMessageRow } from '../utils/supportTicketCrypto.js';
import Notification from '../models/Notification.model.js';
import lifecycle from './noteworthyLifecycle.service.js';

const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories={question:'Practice question',setup:'Setup and trial',continue:'Continue with NoteWorthy',auricwell:'Explore Auricwell'};
function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw fail(400,'INVALID_INQUIRY',`Enter ${label}.`);return value.trim();}
export const noteworthyEmailHash=value=>hash(String(value).trim().toLowerCase());
export function createNoteworthyContact({db=pool,access=lifecycle,encrypt=encryptBillingSecret,decrypt=decryptBillingSecret,encryptMessage=encryptChatText,decodeMessage=decryptTicketMessageRow,encryptionReady=isChatEncryptionConfigured,notify=value=>Notification.create(value)}={}) {
  async function transaction(fn){const c=await db.getConnection();try{await c.beginTransaction();const result=await fn(c);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}}
  async function notifyTeam(ticketId,agencyId,actor=null){
    try{const [users]=await db.execute("SELECT id FROM users WHERE role='super_admin' AND is_active=1 AND COALESCE(is_archived,0)=0");
      for(const user of users){if(Number(user.id)===Number(actor))continue;await notify({type:'support_ticket_created',severity:'info',title:'NoteWorthy message received',message:'A practice inquiry is ready in FundThred’s NoteWorthy queue.',userId:user.id,agencyId,relatedEntityType:'support_ticket',relatedEntityId:ticketId,actorUserId:actor});}}
    catch{/* The committed ticket and operator queue remain authoritative. */}
  }
  async function insertMessage(conn,{ticketId,actorId=null,role='noteworthy_customer',body}){
    if(!encryptionReady())throw fail(503,'MESSAGE_ENCRYPTION_UNAVAILABLE','Secure messaging is temporarily unavailable. Your message has not been confirmed.');
    const e=encryptMessage(body);
    await conn.execute(`INSERT INTO support_ticket_messages(ticket_id,parent_message_id,author_user_id,author_role,body,is_internal,body_ciphertext,body_iv,body_auth_tag,encryption_key_id)
      VALUES(?,NULL,?,?,NULL,0,?,?,?,?)`,[ticketId,actorId,role,e.ciphertextB64,e.ivB64,e.authTagB64,e.keyId]);
  }
  async function create({input,contact,agencyId=null,ownerUserId=null}) {
    const id=String(input.requestId || '');if(!idPattern.test(id))throw fail(400,'INQUIRY_REFERENCE_REQUIRED','Use a valid inquiry reference and try again.');
    const body=text(input.message,'your question (up to 3,000 characters)',3000),category=Object.hasOwn(categories,input.category)?input.category:'question';
    const fingerprint=hash(JSON.stringify({contact,body,category,agencyId,ownerUserId}));
    const result=await transaction(async conn=>{
      const [[existing]]=await conn.execute('SELECT request_hash,support_ticket_id,agency_id,owner_user_id FROM noteworthy_contact_threads WHERE id=? FOR UPDATE',[id]);
      if(existing){if(existing.request_hash!==fingerprint)throw fail(409,'INQUIRY_REFERENCE_REUSED','This reference already belongs to a different request. Start a new message.');return {id,ticketId:existing.support_ticket_id,reused:true,agencyId:existing.agency_id};}
      const [[platform]]=await conn.execute("SELECT id FROM agencies WHERE slug='plottwistco' AND is_active=1 AND COALESCE(is_archived,0)=0");
      if(!platform)throw fail(503,'FUNDTHRED_QUEUE_UNAVAILABLE','FundThred’s queue is temporarily unavailable. Please try again.');
      if(!encryptionReady())throw fail(503,'MESSAGE_ENCRYPTION_UNAVAILABLE','Secure messaging is temporarily unavailable.');
      const question=encryptMessage(`${categories[category]}\nPractice: ${contact.practiceName}\nContact: ${contact.name}\nEmail: ${contact.email}\n\n${body}`);
      const ticketAgency=agencyId || platform.id;
      const [ticket]=await conn.execute(`INSERT INTO support_tickets(school_organization_id,client_id,created_by_user_id,agency_id,subject,question,status,priority,target_scope,source_channel,topic,
        question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id)
        VALUES(?,NULL,?,?,?,NULL,'open','medium','platform',?,'general',?,?,?,?)`,[ticketAgency,ownerUserId,ticketAgency,`NoteWorthy · ${categories[category]}`,ownerUserId?'portal':'public_web',question.ciphertextB64,question.ivB64,question.authTagB64,question.keyId]);
      const payload=JSON.stringify(encrypt(JSON.stringify({id,contact})));
      await conn.execute('INSERT INTO noteworthy_contact_threads(id,agency_id,owner_user_id,support_ticket_id,email_hash,request_hash,contact_enc) VALUES(?,?,?,?,?,?,?)',[id,agencyId,ownerUserId,ticket.insertId,noteworthyEmailHash(contact.email),fingerprint,payload]);
      await insertMessage(conn,{ticketId:ticket.insertId,actorId:ownerUserId,body});
      return {id,ticketId:ticket.insertId,agencyId:ticketAgency};
    });
    if(!result.reused)await notifyTeam(result.ticketId,result.agencyId,ownerUserId);
    return {id:result.id,ticketId:result.ticketId,saved:true};
  }
  async function inquiry(input) {
    if(input.websiteTrap || input.consent!==true)throw fail(400,'INQUIRY_CONSENT_REQUIRED','Confirm that FundThred may contact you about this request.');
    const email=text(input.email,'your email address',254).toLowerCase();
    if(!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email))throw fail(400,'INVALID_EMAIL','Enter a valid email address.');
    const contact={name:text(input.name,'your name',200),practiceName:text(input.practiceName,'your practice name',160),email,consent:true};
    return create({input,contact});
  }
  async function ownerMessage(userId,agencyId,input) {
    const practice=await access.owner(userId,agencyId);
    if(practice.deleted_at || practice.deletion_requested_at)throw fail(409,'WORKSPACE_DELETION_PENDING','This workspace is being deleted. You can use FundThred’s public inquiry form.');
    const [[user]]=await db.execute('SELECT first_name,last_name,email FROM users WHERE id=?',[userId]);
    if(input.threadId){
      const [[thread]]=await db.execute('SELECT id,support_ticket_id FROM noteworthy_contact_threads WHERE id=? AND agency_id=? AND owner_user_id=?',[input.threadId,agencyId,userId]);
      if(!thread)throw fail(404,'THREAD_NOT_FOUND','This conversation is not available to your practice.');
      const message=text(input.message,'your message',3000),requestId=String(input.requestId || ''),fingerprint=hash(message);
      if(!idPattern.test(requestId))throw fail(400,'INQUIRY_REFERENCE_REQUIRED','Use a valid message reference and try again.');
      const created=await transaction(async conn=>{
        await conn.execute('SELECT id FROM noteworthy_contact_threads WHERE id=? FOR UPDATE',[thread.id]);
        const [[prior]]=await conn.execute('SELECT request_hash FROM noteworthy_message_receipts WHERE thread_id=? AND request_id=?',[thread.id,requestId]);
        if(prior){if(prior.request_hash!==fingerprint)throw fail(409,'INQUIRY_REFERENCE_REUSED','This message reference was already used.');return false;}
        await insertMessage(conn,{ticketId:thread.support_ticket_id,actorId:userId,body:message});
        await conn.execute('INSERT INTO noteworthy_message_receipts(thread_id,request_id,request_hash) VALUES(?,?,?)',[thread.id,requestId,fingerprint]);
        await conn.execute("UPDATE support_tickets SET status='open' WHERE id=?",[thread.support_ticket_id]);
        return true;
      });
      if(created)await notifyTeam(thread.support_ticket_id,agencyId,userId);return {id:thread.id,ticketId:thread.support_ticket_id,saved:true};
    }
    return create({input,agencyId,ownerUserId:userId,contact:{name:[user.first_name,user.last_name].filter(Boolean).join(' '),practiceName:practice.name,email:user.email,consent:true}});
  }
  async function threads(userId,agencyId) {
    await access.owner(userId,agencyId);
    const [rows]=await db.execute(`SELECT n.id,n.support_ticket_id ticketId,n.created_at createdAt,t.subject,t.status FROM noteworthy_contact_threads n
      JOIN support_tickets t ON t.id=n.support_ticket_id WHERE n.agency_id=? AND n.owner_user_id=? ORDER BY n.created_at DESC LIMIT 30`,[agencyId,userId]);
    const result=[];
    for(const thread of rows){const [messages]=await db.execute('SELECT * FROM support_ticket_messages WHERE ticket_id=? AND COALESCE(is_internal,0)=0 ORDER BY id LIMIT 200',[thread.ticketId]);
      result.push({...thread,messages:messages.filter(m=>!m.is_deleted).map(m=>{const decoded=decodeMessage(m);return {id:m.id,body:decoded.body,createdAt:m.created_at,sender:Number(m.author_user_id)===Number(userId)||m.author_role==='noteworthy_customer'?'practice':'fundthred'};})});}
    return {threads:result};
  }
  async function operatorThreads(userId) {
    await access.operator(userId);
    const [rows]=await db.execute(`SELECT n.*,t.subject,t.status FROM noteworthy_contact_threads n JOIN support_tickets t ON t.id=n.support_ticket_id ORDER BY n.created_at DESC LIMIT 100`);
    return {inquiries:rows.map(row=>{const data=JSON.parse(decrypt(typeof row.contact_enc==='string'?JSON.parse(row.contact_enc):row.contact_enc));if(data.id!==row.id)throw fail(503,'CONTACT_RECORD_UNAVAILABLE','This contact record needs review.');return {id:row.id,agencyId:row.agency_id,ticketId:row.support_ticket_id,subject:row.subject,status:row.status,createdAt:row.created_at,contact:data.contact};})};
  }
  return {inquiry,ownerMessage,threads,operatorThreads};
}
export default createNoteworthyContact();
