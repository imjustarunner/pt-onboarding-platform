import pool from '../config/database.js';
import {ageOn} from './guardianClinicalAccess.service.js';
import {resolveClientRecordAccess} from './clientRecordAccess.service.js';
import {encryptFamilyBilling} from './familyBillingEncryption.service.js';
import {normalizeSupportChoices,checkIndependenceAuthority,parseSupportJson as json,supportError as fail} from './clientSupportPolicy.service.js';

const aad=clientId=>`client-independence:${clientId}`;
async function audit(db,clientId,userId,actor,action,details={}){
 await db.execute('INSERT INTO dependent_portal_events(client_id,user_id,actor_user_id,action,details_json) VALUES(?,?,?,?,?)',[clientId,userId,actor,action,JSON.stringify(details)]);
}
async function ownClient(userId,db=pool){
 const [[client]]=await db.execute(`SELECT c.*,d.user_id FROM dependent_portal_access d JOIN clients c ON c.id=d.client_id
 JOIN client_guardians cg ON cg.client_id=c.id AND cg.guardian_user_id=d.user_id AND cg.relationship_type='self' AND cg.access_enabled=1
 WHERE d.user_id=? AND d.revoked_at IS NULL`,[userId]);
 if(!client)throw fail(403,'Open your own personal portal to manage access.');
 return client;
}
async function agencies(client,db=pool){
 const [rows]=await db.execute(`SELECT a.id,a.name FROM agencies a WHERE a.is_active=1 AND (a.id=? OR EXISTS
 (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=? AND ca.agency_id=a.id AND ca.is_active=1)) ORDER BY a.name`,[client.agency_id,client.id]);
 return rows;
}
async function helpers(clientId,db=pool){
 const [rows]=await db.execute(`SELECT cg.guardian_user_id AS id,CONCAT_WS(' ',u.first_name,u.last_name) AS name,cg.relationship_title AS relationship
 FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=? AND cg.relationship_type<>'self' ORDER BY u.first_name,u.last_name`,[clientId]);
 return rows;
}
async function validateChoices(client,input,db){
 const choices=normalizeSupportChoices(input),people=await helpers(client.id,db),tenants=await agencies(client,db);
 if(choices.some(c=>!people.some(p=>Number(p.id)===c.helperUserId)||!tenants.some(a=>Number(a.id)===c.agencyId)))throw fail(403,'Choose only a person and agency already associated with your account.');
 return choices;
}
async function queueReview(db,client,userId,subject,question){
 for(const agency of await agencies(client,db))await db.execute(`INSERT INTO support_tickets(school_organization_id,client_id,created_by_user_id,agency_id,subject,question,status)
 VALUES(?,?,?,?,?,?,'open')`,[client.organization_id||agency.id,client.id,userId,agency.id,subject,question]);
}
export async function independenceStatus(userId){
 const client=await ownClient(userId),[[state]]=await pool.execute('SELECT * FROM client_portal_independence WHERE client_id=?',[client.id]);
 const [grants]=await pool.execute('SELECT helper_user_id AS helperUserId,agency_id AS agencyId,scopes_json FROM client_support_grants WHERE client_id=? AND revoked_at IS NULL',[client.id]);
 return {clientId:client.id,status:state?.status||'not_requested',version:state?.version||0,helpers:await helpers(client.id),agencies:await agencies(client),
 choices:state?.status==='active'?grants.map(g=>({helperUserId:g.helperUserId,agencyId:g.agencyId,scopes:json(g.scopes_json)})):json(state?.choices_json),
 ageReviewRequired:ageOn(client.date_of_birth)===null||ageOn(client.date_of_birth)<18};
}
export async function requestIndependence(userId,{choices,confirmed,version}){
 if(confirmed!==true)throw fail(400,'Confirm that these are your choices for your own account.');
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();const client=await ownClient(userId,db);
  await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[client.id]);
  const [[state]]=await db.execute('SELECT * FROM client_portal_independence WHERE client_id=? FOR UPDATE',[client.id]);
  if(state?.status==='active')throw fail(409,'Your account is independent. Update your assistance permissions instead.');
  if(Number(version)!==Number(state?.version||0))throw fail(409,'Access choices changed. Refresh before continuing.');
  const clean=await validateChoices(client,choices,db);
  await db.execute(`INSERT INTO client_portal_independence(client_id,user_id,choices_json) VALUES(?,?,?) ON DUPLICATE KEY UPDATE
   status='requested',version=version+1,choices_json=VALUES(choices_json),requested_at=UTC_TIMESTAMP(),reviewed_by_user_id=NULL,reviewed_at=NULL`,[client.id,userId,JSON.stringify(clean)]);
  await audit(db,client.id,userId,userId,'independence_requested',{choices:clean});
  await queueReview(db,client,userId,'Personal portal independence review','Review the client’s own request in the Guardians panel → Access & independence. Verify identity, authority, court orders and confidential communication restrictions across all agencies before approving.');
  await db.commit();return {status:'requested'};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function requireIndependenceReviewer(user,clientId,db=pool){
 if(!['super_admin','admin','agency_admin'].includes(user?.role))throw fail(403,'An authorized administrator must review account independence.');
 const [[client]]=await db.execute('SELECT * FROM clients WHERE id=?',[clientId]);if(!client)throw fail(404,'Client not found.');
 const access=await resolveClientRecordAccess({userId:user.id,role:user.role,clientId,client});if(!access.ok)throw fail(403,'Client access denied.');
 if(user.role!=='super_admin'){
  const [memberships]=await db.execute('SELECT agency_id FROM user_agencies WHERE user_id=? AND is_active=1',[user.id]);
  if((await agencies(client,db)).some(a=>!memberships.some(m=>Number(m.agency_id)===Number(a.id))))throw fail(403,'An administrator authorized for every agency must coordinate this transition.');
 }
 return client;
}
export async function staffIndependenceStatus(user,clientId){
 await requireIndependenceReviewer(user,clientId);
 const [[state]]=await pool.execute('SELECT * FROM client_portal_independence WHERE client_id=?',[clientId]);
 if(!state)return {status:'not_requested'};
 return {...await independenceStatus(state.user_id),requestedAt:state.requested_at,reviewedAt:state.reviewed_at,authorityBasis:state.authority_basis};
}

// Losing billing assistance stops future authorizations, never deletes debt or
// changes the owner of a saved card. In-flight processor payments need review.
async function removeFinancialDelegation(db,clientId,helperId,agencyId){
 await db.execute(`UPDATE client_billing_payers SET status='revoked',consent_id=NULL,recurring_limit_cents=NULL,payment_card_id=NULL
 WHERE client_id=? AND guardian_user_id=? AND agency_id=?`,[clientId,helperId,agencyId]);
 await db.execute("UPDATE guardian_billing_consents SET revoked_at=UTC_TIMESTAMP() WHERE client_id=? AND guardian_user_id=? AND agency_id=? AND purpose='recurring' AND revoked_at IS NULL",[clientId,helperId,agencyId]);
 await db.execute(`UPDATE family_payment_plans p JOIN family_receivable_allocations a ON a.id=p.allocation_id JOIN family_receivables r ON r.id=a.receivable_id
 SET p.auto_pay=0 WHERE r.client_id=? AND p.payer_user_id=? AND p.agency_id=? AND p.status IN ('proposed','active')`,[clientId,helperId,agencyId]);
 await db.execute('UPDATE family_statement_shares SET active=0 WHERE client_id=? AND guardian_user_id=? AND agency_id=?',[clientId,helperId,agencyId]);
}
async function replaceGrants(db,client,userId,choices){
 const [old]=await db.execute('SELECT * FROM client_support_grants WHERE client_id=? FOR UPDATE',[client.id]);
 await db.execute('UPDATE client_support_grants SET revoked_at=UTC_TIMESTAMP() WHERE client_id=? AND revoked_at IS NULL',[client.id]);
 for(const c of choices)await db.execute(`INSERT INTO client_support_grants(client_id,agency_id,helper_user_id,scopes_json,approved_by_user_id,revoked_at)
 VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE scopes_json=VALUES(scopes_json),approved_by_user_id=VALUES(approved_by_user_id),approved_at=UTC_TIMESTAMP(),revoked_at=VALUES(revoked_at)`,[client.id,c.agencyId,c.helperUserId,JSON.stringify(c.scopes),userId,c.scopes.length?null:new Date()]);
 const [payers]=await db.execute('SELECT agency_id,guardian_user_id FROM client_billing_payers WHERE client_id=?',[client.id]);
 for(const p of payers){if(Number(p.guardian_user_id)===Number(userId))continue;
  if(!choices.some(c=>c.helperUserId===Number(p.guardian_user_id)&&c.agencyId===Number(p.agency_id)&&c.scopes.includes('billing')))await removeFinancialDelegation(db,client.id,p.guardian_user_id,p.agency_id);
 }
 // Requests cannot be acted on after the client removes the corresponding permission.
 const [requests]=await db.execute("SELECT id,helper_user_id,agency_id,scope FROM client_support_requests WHERE client_id=? AND status='pending'",[client.id]);
 for(const r of requests)if(!choices.some(c=>c.helperUserId===Number(r.helper_user_id)&&c.agencyId===Number(r.agency_id)&&c.scopes.includes(r.scope)))await db.execute("UPDATE client_support_requests SET status='cancelled',resolved_at=UTC_TIMESTAMP(),resolved_by_user_id=? WHERE id=?",[userId,r.id]);
 return old.map(g=>({helperUserId:g.helper_user_id,agencyId:g.agency_id,scopes:json(g.scopes_json),revoked:!!g.revoked_at}));
}
export async function reviewIndependence(user,clientId,{version,approve,basis,evidence,reviewed}){
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();const client=await requireIndependenceReviewer(user,clientId,db);
  await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[clientId]);
  const [[state]]=await db.execute('SELECT * FROM client_portal_independence WHERE client_id=? FOR UPDATE',[clientId]);
  if(!state||state.status!=='requested'||Number(version)!==state.version)throw fail(409,'This request changed or was already reviewed. Refresh first.');
  if(typeof approve!=='boolean')throw fail(400,'Choose approve or decline.');
  if(!approve){
   if(!String(evidence||'').trim())throw fail(400,'Record why this request needs further review.');
   await db.execute("UPDATE client_portal_independence SET status='declined',version=version+1,reviewed_at=UTC_TIMESTAMP(),reviewed_by_user_id=?,evidence_encrypted=? WHERE client_id=?",[user.id,encryptFamilyBilling({reason:String(evidence).slice(0,8000)},aad(clientId)),clientId]);
   await audit(db,clientId,state.user_id,user.id,'independence_declined');await db.commit();return {status:'declined'};
  }
  checkIndependenceAuthority({age:ageOn(client.date_of_birth),basis,reviewed,evidence});
  await ownClient(state.user_id,db); // Revoked or unclaimed accounts cannot be transitioned by a stale review.
  const [[account]]=await db.execute('SELECT password_hash,status,is_active,is_archived FROM users WHERE id=?',[state.user_id]);
  if(!account?.password_hash||Number(account.is_active)!==1||Number(account.is_archived)===1||!['ACTIVE','ACTIVE_EMPLOYEE'].includes(account.status))throw fail(409,'The client must activate their own login before this transition.');
  const choices=await validateChoices(client,json(state.choices_json),db),people=await helpers(clientId,db);
  await db.execute("UPDATE client_portal_independence SET status='active',version=version+1,reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP(),authority_basis=?,evidence_encrypted=?,activated_at=UTC_TIMESTAMP() WHERE client_id=?",[user.id,basis,encryptFamilyBilling({evidence:evidence.trim(),authorityReviewed:true},aad(clientId)),clientId]);
  await db.execute("UPDATE client_guardians SET access_enabled=0 WHERE client_id=? AND relationship_type<>'self'",[clientId]);
  await db.execute('UPDATE guardian_clinical_grants SET revoked_at=UTC_TIMESTAMP() WHERE client_id=? AND guardian_user_id<>? AND revoked_at IS NULL',[clientId,state.user_id]);
  await db.execute('UPDATE users SET passwordless_token=NULL,passwordless_token_expires_at=NULL,passwordless_token_purpose=NULL WHERE id=?',[state.user_id]);
  for(const p of people){
   await db.execute(`DELETE cp FROM chat_thread_participants cp JOIN chat_threads t ON t.id=cp.thread_id
    LEFT JOIN guardian_client_threads gt ON gt.thread_id=t.id WHERE cp.user_id=? AND (t.client_id=? OR gt.client_id=?)`,[p.id,clientId,clientId]);
  }
  // Reminder contacts were approved under the former family relationship.
  // They require a new, explicit arrangement rather than carrying over silently.
  await db.execute('UPDATE client_contact_affiliations SET is_active=0,email_reminders_enabled=0,sms_reminders_enabled=0,sms_opt_in=0 WHERE client_id=?',[clientId]);
  await replaceGrants(db,client,state.user_id,choices);
  await audit(db,clientId,state.user_id,user.id,'independence_activated',{basis,choices,formerGuardians:people.map(p=>p.id)});
  await queueReview(db,client,user.id,'Independent portal billing handoff','Portal access has changed. Review outstanding liabilities, any processor payment already in flight, confidential billing communications and insurance correspondence. Existing debts and receipts are retained; removed delegates have no future recurring authorization. See Guardians → Access & independence.');
  await db.commit();return {status:'active'};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function updateSupportChoices(userId,{choices,confirmed,version}){
 if(confirmed!==true)throw fail(400,'Confirm your assistance choices.');
 const db=await pool.getConnection();try{
  await db.beginTransaction();const client=await ownClient(userId,db);await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[client.id]);
  const [[state]]=await db.execute('SELECT * FROM client_portal_independence WHERE client_id=? FOR UPDATE',[client.id]);
  if(state?.status!=='active'||Number(state.user_id)!==Number(userId))throw fail(403,'Independence must be reviewed first.');
  if(Number(version)!==state.version)throw fail(409,'Access choices changed. Refresh before saving.');
  const clean=await validateChoices(client,choices,db),previous=await replaceGrants(db,client,userId,clean);
  await db.execute('UPDATE client_portal_independence SET choices_json=?,version=version+1 WHERE client_id=?',[JSON.stringify(clean),client.id]);
  await audit(db,client.id,userId,userId,'assistance_changed',{previous,choices:clean});
  await db.commit();return {saved:true};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
