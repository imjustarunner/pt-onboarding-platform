import {officeVisitWindowOpen} from './tutoringOfficeWindow.service.js';
import crypto from 'node:crypto';
import pool from '../config/database.js';
import { assertOfficeAccess } from './privateVirtualOffice.service.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
async function authorize(db,room,visitId,actor,lock=false) {
 if(!Number.isSafeInteger(visitId)||visitId<1)throw fail(404,'Visit not found.');
 let predicate='',params=[visitId,room.id];
 if(actor.role==='provider'){
  if(Number(actor.userId)!==Number(room.userId))throw fail(403,'This office belongs to another provider.');
 }else if(actor.role==='guest'&&/^[A-Za-z0-9_-]{43}$/.test(String(actor.credential||''))){
  predicate=' AND credential_hash=? AND expires_at>UTC_TIMESTAMP()';
  params.push(crypto.createHash('sha256').update(actor.credential).digest('hex'));
 }else throw fail(403,'Reopen the office link to message your provider.');
 const [[visit]]=await db.execute(`SELECT id,status,display_name,expires_at FROM private_virtual_office_visits WHERE id=? AND room_id=?${predicate}${lock?' FOR UPDATE':''}`,params);
 if(!visit)throw fail(403,'This visit is unavailable.');
 return visit;
}
const canSend=visit=>['waiting','admitted'].includes(visit.status)&&new Date(visit.expires_at).getTime()>Date.now();
const audit=(room,visitId,actor,action,details={},db)=>clinicalAudit({kind:'office',sessionId:room.id,agencyId:room.agencyId,role:actor.role,actor:actor.role==='provider'?`user-${room.userId}`:`office-visit-${visitId}`,req:actor.req},action,{visitId,...details},db);
export async function readOfficeMessages(room,visitId,actor) {
 await assertOfficeAccess(room);
 const visit=await authorize(pool,room,visitId,actor);
 const [rows]=await pool.execute('SELECT id,author_role,body_envelope,created_at FROM private_virtual_office_messages WHERE room_id=? AND visit_id=? ORDER BY id DESC LIMIT 100',[room.id,visitId]);
 const messages=rows.reverse().map(row=>({id:row.id,author:row.author_role,body:decryptChatText(JSON.parse(row.body_envelope)),createdAt:row.created_at}));
 if(messages.length)await pool.execute('UPDATE private_virtual_office_messages SET read_at=COALESCE(read_at,UTC_TIMESTAMP(3)) WHERE room_id=? AND visit_id=? AND author_role<>? AND id<=?',[room.id,visitId,actor.role,messages.at(-1).id]);
 await audit(room,visitId,actor,'office_private_messages_read',{messageIds:messages.map(m=>m.id)});
 const windowOpen=await officeVisitWindowOpen(visitId,pool,{messaging:true});
 return {messages,canSend:canSend(visit)&&windowOpen,closedReason:!windowOpen?'This appointment’s office chat window has closed. Use secure messages for follow-up.':'This visit has ended. Start a new visit to send another message.'};
}
export async function sendOfficeMessage(room,visitId,actor,input={}) {
 await assertOfficeAccess(room);
 const body=typeof input.body==='string'?input.body.trim():'';
 if(!body||body.length>2000)throw fail(400,'Enter a message of up to 2,000 characters.');
 if(!/^[a-zA-Z0-9_-]{16,80}$/.test(String(input.nonce||'')))throw fail(400,'Please retry sending your message.');
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();
  const visit=await authorize(db,room,visitId,actor,true);
  const [[existing]]=await db.execute('SELECT id FROM private_virtual_office_messages WHERE room_id=? AND visit_id=? AND author_role=? AND nonce=?',[room.id,visitId,actor.role,input.nonce]);
  if(existing){await db.commit();return {id:existing.id};}
  if(!await officeVisitWindowOpen(visitId,db,{messaging:true}))throw fail(409,'This appointment’s office chat window has closed. Use secure messages to contact your tutor.');
  if(!canSend(visit))throw fail(409,'This visit has ended. Reopen the office link to start a new conversation.');
  const [[recent]]=await db.execute('SELECT COUNT(*) AS total FROM private_virtual_office_messages WHERE room_id=? AND visit_id=? AND author_role=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE)',[room.id,visitId,actor.role]);
  if(Number(recent.total)>=10)throw fail(429,'Please wait a moment before sending another message.');
  const [result]=await db.execute('INSERT INTO private_virtual_office_messages (room_id,visit_id,author_role,nonce,body_envelope) VALUES (?,?,?,?,?)',[room.id,visitId,actor.role,input.nonce,JSON.stringify(encryptChatText(body))]);
  await audit(room,visitId,actor,'office_private_message_sent',{messageId:result.insertId},db);
  await db.commit();return {id:result.insertId};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
