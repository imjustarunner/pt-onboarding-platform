import crypto from 'node:crypto';
import pool from '../../config/database.js';
import {ageOn} from '../guardianClinicalAccess.service.js';

const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export function pendingSecureContact(link,client,access) {
 const permissions=link.permissions_json || {};
 return Number(link.access_enabled)===1 && ![0,false,'0'].includes(link.is_active)
  && ['PENDING_SETUP','PENDING','INVITED','ACTIVE','ACTIVE_EMPLOYEE'].includes(String(link.status).toUpperCase())
  && ['client','client_guardian','guardian'].includes(String(link.role).toLowerCase())
  && !permissions.dependentSelfAccess && !permissions.noView && !permissions.noViewOtherGuardian && permissions.canMessage!==false
  && !access.reviewRequired && access.scopes.includes('clinical_messages') && !!link.email && !!client.date_of_birth
  && !!client.guardian_portal_enabled;
}

// Only create a new adult self identity. Existing identities, revoked links, and
// dependent accounts require the established portal-authority review instead.
export async function prepareAdultSecureRecipient(clientId,actorUserId) {
 const db=await pool.getConnection();
 try {
  await db.beginTransaction();
  const [[client]]=await db.execute('SELECT * FROM clients WHERE id=? FOR UPDATE',[clientId]);
  const email=String(client?.contact_email || client?.email || '').trim().toLowerCase();
  if(!client?.date_of_birth || ageOn(client.date_of_birth)<18 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Review the adult client’s birth date and portal email before inviting them.');
  const [[independent]]=await db.execute("SELECT user_id FROM client_portal_independence WHERE client_id=? AND status='active'",[clientId]);
  if(independent)throw fail('Review the client’s existing independent portal account.');
  const [links]=await db.execute('SELECT guardian_user_id,relationship_type,access_enabled,permissions_json FROM client_guardians WHERE client_id=?',[clientId]);
  if(links.length)throw fail('Review the existing portal relationships before creating a self account.');
  const [existing]=await db.execute('SELECT id FROM users WHERE LOWER(email)=? OR LOWER(personal_email)=? LIMIT 1 FOR UPDATE',[email,email]);
  if(existing.length)throw fail('This email already belongs to an account. Review and link the correct self account in Portal settings first.');
  const words=String(client.full_name || '').trim().split(/\s+/),last=words.length>1?words.pop():'',first=words.join(' ');
  if(!first)throw fail('Review the client’s name before creating a portal account.');
  const [created]=await db.execute("INSERT INTO users (role,status,first_name,last_name,email,phone_number,is_active) VALUES ('client','PENDING_SETUP',?,?,?,?,1)",[first,last,email,client.contact_phone||null]);
  const userId=Number(created.insertId);
  await db.execute("INSERT INTO client_guardians (client_id,guardian_user_id,relationship_type,relationship_title,access_enabled,permissions_json,created_by_user_id) VALUES (?,?,'self','Self',1,?,?)",[clientId,userId,JSON.stringify({canMessage:true}),actorUserId]);
  await db.execute('UPDATE clients SET guardian_portal_enabled=1 WHERE id=?',[clientId]);
  await db.commit();return userId;
 }catch(error){await db.rollback();if(error.code==='ER_DUP_ENTRY')throw fail('An account was just created for this email. Review Portal settings before retrying.');throw error;}finally{db.release();}
}

export async function reserveSecureDelivery({senderId,requestKey,agencyId,clientId,recipientKey,text},db=pool) {
 if(!/^[a-zA-Z0-9-]{20,64}$/.test(String(requestKey || '')))throw fail('A unique send request is required.',400);
 const hash=crypto.createHash('sha256').update(JSON.stringify([agencyId,clientId,recipientKey,text])).digest('hex');
 const [result]=await db.execute('INSERT IGNORE INTO mobile_secure_deliveries (sender_user_id,request_key,agency_id,client_id,recipient_key,content_hash) VALUES (?,?,?,?,?,?)',[senderId,requestKey,agencyId,clientId,recipientKey,hash]);
 const [[row]]=await db.execute('SELECT * FROM mobile_secure_deliveries WHERE sender_user_id=? AND request_key=?',[senderId,requestKey]);
 if(!row || row.content_hash!==hash)throw fail('This send request belongs to different content.');
 return {row,fresh:result.affectedRows===1};
}
export function secureDeliveryReceipt(row) {
 return {ok:!!row.message_id,threadId:row.thread_id || null,messageId:row.message_id || null,deliveryStatus:row.delivery_status};
}
