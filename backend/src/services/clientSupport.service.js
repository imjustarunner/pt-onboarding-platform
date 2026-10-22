import pool from '../config/database.js';
import {requireSupportScope,parseSupportJson as json,supportError as fail} from './clientSupportPolicy.service.js';
import {requireIndependenceReviewer} from './clientIndependence.service.js';
import {encryptFamilyBilling,decryptFamilyBilling} from './familyBillingEncryption.service.js';

const aad=(agencyId,clientId)=>`client-support:${agencyId}:${clientId}`;
export async function pastPaymentAgencies(userId){
 const [rows]=await pool.execute("SELECT DISTINCT a.id,a.name FROM family_ledger_payments p JOIN agencies a ON a.id=p.agency_id WHERE p.payer_user_id=? AND p.status='succeeded' ORDER BY a.name",[userId]);
 return rows;
}
export async function supportAccounts(userId){
 const [rows]=await pool.execute(`SELECT g.client_id AS clientId,g.agency_id AS agencyId,c.full_name AS clientName,a.name AS agencyName,g.scopes_json
 FROM client_support_grants g JOIN client_portal_independence i ON i.client_id=g.client_id AND i.status='active'
 JOIN clients c ON c.id=g.client_id JOIN agencies a ON a.id=g.agency_id
 WHERE g.helper_user_id=? AND g.revoked_at IS NULL AND a.is_active=1 ORDER BY c.full_name,a.name`,[userId]);
 return rows.map(({scopes_json,...row})=>({...row,scopes:json(scopes_json)}));
}
export async function supportDetails(userId,clientId,agencyId){
 const account=(await supportAccounts(userId)).find(c=>Number(c.clientId)===clientId&&Number(c.agencyId)===agencyId);
 if(!account)throw fail(403,'This assistance permission is not active.');
 const result={...account,contact:null,appointments:[],requests:[]};
 if(account.scopes.includes('contact')){
  const [[contact]]=await pool.execute('SELECT contact_phone,email,address_street,address_apt,address_city,address_state,address_zip FROM clients WHERE id=?',[clientId]);
  result.contact=contact;
 }
 if(account.scopes.includes('scheduling')){
  const [appointments]=await pool.execute(`SELECT a.id,a.start_at AS startAt,a.end_at AS endAt,a.source_timezone AS timeZone,a.status,CONCAT_WS(' ',u.first_name,u.last_name) AS providerName
   FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id JOIN users u ON u.id=a.provider_user_id
   WHERE p.client_id=? AND a.agency_id=? AND a.start_at>=UTC_TIMESTAMP() AND a.status IN ('scheduled','confirmed','client_confirmed') ORDER BY a.start_at LIMIT 30`,[clientId,agencyId]);
  result.appointments=appointments; // No clinical type, session contents, history, or join links.
 }
 const [requests]=await pool.execute('SELECT id,scope,status,created_at AS createdAt FROM client_support_requests WHERE client_id=? AND agency_id=? AND helper_user_id=? ORDER BY id DESC LIMIT 30',[clientId,agencyId,userId]);
 result.requests=requests.filter(r=>account.scopes.includes(r.scope));return result;
}
export async function submitSupportRequest(userId,clientId,agencyId,{scope,message}){
 if(!['contact','scheduling'].includes(scope)||typeof message!=='string'||!message.trim()||message.length>2000)throw fail(400,'Describe the contact or scheduling change you are requesting (up to 2,000 characters).');
 const db=await pool.getConnection();try{
  await db.beginTransaction();await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[clientId]);
  await requireSupportScope(userId,clientId,agencyId,scope,db);
  const [recent]=await db.execute("SELECT id FROM client_support_requests WHERE client_id=? AND agency_id=? AND helper_user_id=? AND scope=? AND status='pending'",[clientId,agencyId,userId,scope]);
  if(recent.length)throw fail(409,'Your previous request is still being reviewed. Contact the office if it is urgent.');
  const [r]=await db.execute('INSERT INTO client_support_requests(client_id,agency_id,helper_user_id,scope,request_encrypted) VALUES(?,?,?,?,?)',[clientId,agencyId,userId,scope,encryptFamilyBilling({message:message.trim()},aad(agencyId,clientId))]);
  const [[client]]=await db.execute('SELECT organization_id FROM clients WHERE id=?',[clientId]);
  await db.execute(`INSERT INTO support_tickets(school_organization_id,client_id,created_by_user_id,agency_id,subject,question,status) VALUES(?,?,?,?,?,?,'open')`,[client?.organization_id||agencyId,clientId,userId,agencyId,'Client-approved assistance request',`Review request #${r.insertId} in Guardians → Access & independence. Check the current delegated permission before making any changes. Login credentials are never part of this permission.`]);
  await db.commit();return {id:r.insertId,status:'pending'};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function staffSupportRequests(user,clientId){
 await requireIndependenceReviewer(user,clientId);
 const [rows]=await pool.execute(`SELECT r.*,CONCAT_WS(' ',u.first_name,u.last_name) AS helperName,a.name AS agencyName
 FROM client_support_requests r JOIN users u ON u.id=r.helper_user_id JOIN agencies a ON a.id=r.agency_id WHERE r.client_id=? ORDER BY r.id DESC LIMIT 50`,[clientId]);
 return rows.map(({request_encrypted,...r})=>({...r,...decryptFamilyBilling(request_encrypted,aad(r.agency_id,clientId))}));
}
export async function resolveSupportRequest(user,clientId,requestId){
 const db=await pool.getConnection();try{
  await db.beginTransaction();await requireIndependenceReviewer(user,clientId,db);await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[clientId]);
  const [[r]]=await db.execute("SELECT * FROM client_support_requests WHERE id=? AND client_id=? AND status='pending' FOR UPDATE",[requestId,clientId]);
  if(!r)throw fail(409,'This request is no longer pending.');
  await requireSupportScope(r.helper_user_id,clientId,r.agency_id,r.scope,db);
  await db.execute("UPDATE client_support_requests SET status='resolved',resolved_by_user_id=?,resolved_at=UTC_TIMESTAMP() WHERE id=?",[user.id,requestId]);
  await db.commit();return {resolved:true};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
