import pool from '../config/database.js';
import { encryptChatText } from './chatEncryption.service.js';
import { decryptTicketRow } from '../utils/supportTicketCrypto.js';
import { lobbyLocation, officePeople } from './officeLobby.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function submitOfficeSupport({locationId,agencyId,providerId,requestKey,message}){
 if(!/^[a-f0-9-]{36}$/i.test(String(requestKey||'')))throw fail(400,'Please reopen the support form.');
 const text=String(message||'').trim();if(!text||text.length>4000)throw fail(400,'Please enter a message of up to 4,000 characters.');
 const location=await lobbyLocation(locationId),{people}=await officePeople(location);
 const provider=people.find(p=>Number(p.id)===Number(providerId)&&Number(p.agencyId)===Number(agencyId));
 if(!provider)throw fail(400,'Choose a company at this location and one of its providers.');
 // Fail closed: the kiosk must never fall back to storing a visitor's text unencrypted.
 let encrypted;try{encrypted=encryptChatText(text);}catch{throw fail(503,'Secure messaging is temporarily unavailable. Please ask the office team for help.');}
 const conn=await pool.getConnection();try{
 await conn.beginTransaction();
 const [[existing]]=await conn.execute('SELECT id,office_location_id,agency_id,provider_id FROM office_kiosk_support_requests WHERE request_key=? FOR UPDATE',[requestKey]);
 if(existing){if(Number(existing.office_location_id)!==Number(locationId)||Number(existing.agency_id)!==Number(agencyId)||Number(existing.provider_id)!==Number(providerId))throw fail(409,'Please reopen the support form.');await conn.commit();return {ok:true};}
 const [[identity]]=await conn.execute("SELECT from_email FROM email_sender_identities WHERE agency_id=? AND is_active=1 AND identity_key IN ('support','notifications') ORDER BY (identity_key='support') DESC LIMIT 1",[agencyId]);
 const domain=String(identity?.from_email||'').split('@')[1];if(!domain||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain))throw fail(503,'This office’s secure support inbox is not ready. Please ask staff for help.');
 const sender=`kiosk@${domain}`;
 const [staff]=await conn.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.is_active=1 WHERE ua.agency_id=? AND u.is_active=1 AND u.terminated_at IS NULL AND COALESCE(u.is_archived,0)=0 AND u.role IN ('admin','super_admin','support')`,[agencyId]);
 if(!staff.length)throw fail(503,'The support team is not configured for this company. Please ask staff for help.');
 const [ticket]=await conn.execute(`INSERT INTO support_tickets (school_organization_id,agency_id,created_by_source_key,subject,question,status,source_channel,source_email_from,topic,question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id)
 VALUES (?,?,'office_kiosk_support',?,NULL,'open','public_web',?,'general',?,?,?,?)`,[agencyId,agencyId,`Office check-in help · ${location.name}`.slice(0,255),sender,encrypted.ciphertextB64,encrypted.ivB64,encrypted.authTagB64,encrypted.keyId]);
 const [request]=await conn.execute('INSERT INTO office_kiosk_support_requests (request_key,office_location_id,agency_id,provider_id,ticket_id,sender_address) VALUES (?,?,?,?,?,?)',[requestKey,locationId,agencyId,providerId,ticket.insertId,sender]);
 for(const id of new Set([...staff.map(s=>Number(s.id)),Number(providerId)])){
 await conn.execute('INSERT INTO office_kiosk_support_recipients (request_id,user_id) VALUES (?,?)',[request.insertId,id]);
 await conn.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_source)
 VALUES (?,'info','Office check-in help requested','A visitor sent a secure message from the office kiosk. Open it in the app; the selected provider is copied.',?,?,'office_kiosk_support',?,?)`,[id===Number(providerId)?'support_ticket_forwarded_to_provider':'support_ticket_created',id,agencyId,request.insertId,sender]);
 }
 await conn.commit();return {ok:true};
 }catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY')return {ok:true};throw e;}finally{conn.release();}
}
export async function readOfficeSupport(id,user){
 const [[row]]=await pool.execute(`SELECT r.*,t.subject,t.question,t.question_ciphertext,t.question_iv,t.question_auth_tag,t.question_encryption_key_id,l.name location_name,a.name agency_name,u.first_name,u.last_name
 FROM office_kiosk_support_requests r JOIN office_kiosk_support_recipients recipient ON recipient.request_id=r.id AND recipient.user_id=?
 JOIN user_agencies ua ON ua.user_id=recipient.user_id AND ua.agency_id=r.agency_id AND ua.is_active=1
 JOIN support_tickets t ON t.id=r.ticket_id JOIN office_locations l ON l.id=r.office_location_id JOIN agencies a ON a.id=r.agency_id JOIN users u ON u.id=r.provider_id
 WHERE r.id=? LIMIT 1`,[user.id,id]);
 if(!row||!(Number(row.provider_id)===Number(user.id)||['admin','super_admin','support'].includes(user.role)))throw fail(404,'Message not found');
 const ticket=decryptTicketRow(row);return {id:row.id,from:row.sender_address,to:`${row.agency_name} support`,cc:`${row.first_name} ${row.last_name}`,location:row.location_name,message:ticket.question,createdAt:row.created_at,ticketId:row.ticket_id};
}
