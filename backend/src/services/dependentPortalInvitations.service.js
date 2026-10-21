import pool from '../config/database.js';
import User from '../models/User.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import {ageOn,requireClinicalScope} from './guardianClinicalAccess.service.js';
import {resolveClientRecordAccess} from './clientRecordAccess.service.js';
import {clientAgencyMembership} from './clientServiceEnrollment.service.js';
import {clientEmailContext,sendClientPortalEmail} from './clientPortalEmail.service.js';
import {escapePortalHtml as esc} from './portalEmailBranding.service.js';
import {clientPortalInviteUrl} from './clientPortalContext.service.js';
import {portalActionHtml} from './clientPortalEmailContent.js';
import {dependentError as fail,dependentRecordScopes} from './dependentPortalPolicy.service.js';

export async function parentDependentAccess(userId,clientId,db=pool){
 const [[c]]=await db.execute(`SELECT c.*,cg.relationship_type,cg.permissions_json,cg.access_enabled FROM clients c
 JOIN client_guardians cg ON cg.client_id=c.id WHERE c.id=? AND cg.guardian_user_id=?`,[clientId,userId]);
 const p=ClientGuardian.parsePermissions(c?.permissions_json)||{};
 if(!c||Number(c.access_enabled)!==1||c.relationship_type!=='guardian'||ClientGuardian.isNoView(p)||p.coGuardianInviteRestricted||p.dependentSelfAccess)throw fail(403,'An authorized guardian must manage this invitation.');
 const age=ageOn(c.date_of_birth);
 if(age===null||age<0||age>=18)throw fail(409,'Ask the care team to review personal portal access for this client.');
 if(!['learning','tutoring'].includes(c.client_type))await requireClinicalScope({userId,clientId,agencyId:c.agency_id,scope:'session_frequency'});
 return c;
}
async function event(db,clientId,userId,actor,action,details={}){
 await db.execute('INSERT INTO dependent_portal_events(client_id,user_id,actor_user_id,action,details_json) VALUES(?,?,?,?,?)',[clientId,userId,actor,action,JSON.stringify(details)]);
}
export async function dependentInvitationStatus(userId,clientId){
 await parentDependentAccess(userId,clientId);
 const [[a]]=await pool.execute(`SELECT d.user_id,d.revoked_at,d.created_at,d.last_invited_at,u.email,u.password_hash IS NOT NULL AS password_set
 FROM dependent_portal_access d JOIN users u ON u.id=d.user_id WHERE d.client_id=?`,[clientId]);
 return {invitation:a?{email:a.email,active:!a.revoked_at,passwordSet:!!a.password_set,lastInvitedAt:a.last_invited_at}:null};
}
export async function inviteDependent({userId,clientId,email,confirmed=false}){
 if(confirmed!==true)throw fail(400,'Confirm that you are authorized to invite this dependent to their own portal.');
 const address=String(email||'').trim().toLowerCase();
 if(address.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(address))throw fail(400,'Enter the dependent’s own email address.');
 const client=await parentDependentAccess(userId,clientId);
 const db=await pool.getConnection();let childUserId;
 try{
  await db.beginTransaction();await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[clientId]);
  const [[old]]=await db.execute('SELECT * FROM dependent_portal_access WHERE client_id=?',[clientId]);
  if(old)throw fail(409,'This dependent already has a personal login. Use resend, or ask your care team to change the email.');
  const [[used]]=await db.execute('SELECT id FROM users WHERE LOWER(email)=? OR LOWER(username)=? LIMIT 1',[address,address]);
  if(used)throw fail(409,'Use a separate email address for this dependent. Existing accounts cannot be merged here.');
  const name=String(client.full_name||client.initials||'Client').trim().split(/\s+/);
  const [created]=await db.execute(`INSERT INTO users (email,username,role,status,first_name,last_name,is_active,is_demo,status_expires_at)
   VALUES (?,?,'client_guardian','PENDING_SETUP',?,?,1,?,?)`,[address,address,name.shift(),name.join(' '),Number(client.is_demo)||0,client.is_demo?new Date(Date.now()+7*86400000):null]);
  childUserId=created.insertId;
  const permissions={dependentSelfAccess:true,canViewAppointments:true,canMessage:true,canViewDocs:true,canViewProgress:true,canSignDocs:false,canManageBilling:false,canViewLinks:true};
  await db.execute(`INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,relationship_title,access_enabled,permissions_json,created_by_user_id) VALUES(?,?,'self','Personal portal',1,?,?)`,[clientId,childUserId,JSON.stringify(permissions),userId]);
  await db.execute('INSERT INTO dependent_portal_access(user_id,client_id,invited_by_user_id) VALUES(?,?,?)',[childUserId,clientId,userId]);
  await db.execute(`INSERT INTO user_agencies(user_id,agency_id,is_active) SELECT ?,a.id,1 FROM agencies a
   WHERE a.is_active=1 AND (a.id=? OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=? AND ca.agency_id=a.id AND ca.is_active=1))`,[childUserId,client.agency_id,clientId]);
  await event(db,clientId,childUserId,userId,'invited',{authorityConfirmed:true});await db.commit();
 }catch(e){await db.rollback();if(e.code==='ER_DUP_ENTRY')throw fail(409,'Use a separate email address for this dependent.');throw e;}finally{db.release();}
 return resendDependentInvitation({userId,clientId});
}
export async function resendDependentInvitation({userId,clientId}){
 const client=await parentDependentAccess(userId,clientId);
 const [[a]]=await pool.execute('SELECT d.*,u.email,u.first_name FROM dependent_portal_access d JOIN users u ON u.id=d.user_id WHERE d.client_id=?',[clientId]);
 if(!a||a.revoked_at)throw fail(409,'This personal login is not active. Ask the care team to review it.');
 // Reserve before generating a token or sending: concurrent requests must not
 // invalidate each other's links or deliver duplicate invitations.
 const [reserved]=await pool.execute('UPDATE dependent_portal_access SET last_invited_at=UTC_TIMESTAMP() WHERE user_id=? AND revoked_at IS NULL AND (last_invited_at IS NULL OR last_invited_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE))',[a.user_id]);
 if(!reserved.affectedRows)throw fail(429,'Wait a minute before sending another invitation.');
 const context=await clientEmailContext({agencyId:client.agency_id,clientId});
 const account=await User.findById(a.user_id);
 const token=await User.generatePasswordlessToken(a.user_id,48,account.password_hash?'reset':'setup');
 const url=account.password_hash?context.url(`reset-password/${encodeURIComponent(token.token)}`):clientPortalInviteUrl({portal:context.portal,token:token.token,existingAccount:false});
 const intro=`Hi ${a.first_name}, your personal portal with ${context.tenant.name} is ready. This login opens only your own appointments, learning materials, messages, and records your care team shares with you.`;
 const result=await sendClientPortalEmail({agencyId:client.agency_id,clientId,context,to:a.email,userId:a.user_id,generatedByUserId:userId,source:'manual',templateType:'hub_portal_invite',subject:`Your personal ${context.tenant.name} portal`,
  text:`${intro}\n\nYour username: ${a.email}\nSet your password: ${url}\n\nThis link expires in 48 hours.`,
  html:`<h2>Your personal portal</h2><p>${esc(intro)}</p><p>Your username: <strong>${esc(a.email)}</strong></p>${portalActionHtml('Set my password',url)}<p>This link expires in 48 hours.</p>`});
 if(!result?.id||result?.skipped||result?.blocked||result?.pendingApproval||result?.queued)throw fail(409,'The invitation is saved, but email delivery needs your care team’s attention.');
 await event(pool,clientId,a.user_id,userId,'invitation_sent');return {sent:true};
}
export async function revokeDependentInvitation({userId,clientId}){
 await parentDependentAccess(userId,clientId);
 const db=await pool.getConnection();try{await db.beginTransaction();const [[a]]=await db.execute('SELECT * FROM dependent_portal_access WHERE client_id=? FOR UPDATE',[clientId]);
 if(!a)throw fail(404,'No personal login has been invited.');
 await db.execute('UPDATE dependent_portal_access SET revoked_at=UTC_TIMESTAMP() WHERE user_id=?',[a.user_id]);
 await db.execute('UPDATE client_guardians SET access_enabled=0 WHERE guardian_user_id=? AND client_id=?',[a.user_id,clientId]);
 await db.execute('UPDATE users SET passwordless_token=NULL,passwordless_token_expires_at=NULL,passwordless_token_purpose=NULL WHERE id=?',[a.user_id]);
 await db.execute("UPDATE auth_session_security SET revoked_at=UTC_TIMESTAMP(3),end_reason='Personal portal access revoked' WHERE user_id=? AND revoked_at IS NULL",[a.user_id]);
 await db.execute('INSERT INTO user_auth_revocations(user_id,reject_issued_before,revoked_at,revoked_by_user_id) VALUES(?,UNIX_TIMESTAMP()+1,UTC_TIMESTAMP(3),?) ON DUPLICATE KEY UPDATE reject_issued_before=VALUES(reject_issued_before),revoked_at=VALUES(revoked_at),revoked_by_user_id=VALUES(revoked_by_user_id)',[a.user_id,userId]);
 await event(db,clientId,a.user_id,userId,'revoked');await db.commit();return {revoked:true};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function staffDependentSharing(user,clientId,{agencyId,scopes,reviewed,restore=false}={}){
 if(!['super_admin','admin','provider','provider_plus','supervisor','clinical_practice_assistant'].includes(user.role))throw fail(403,'Care-team access required.');
 const access=await resolveClientRecordAccess({userId:user.id,role:user.role,clientId});if(!access.ok)throw fail(403,'Client access denied.');
 if(!Number.isSafeInteger(agencyId)||agencyId<1||!await clientAgencyMembership(clientId,agencyId))throw fail(403,'This client is not enrolled with the selected agency.');
 const [[member]]=await pool.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[user.id,agencyId]);
 if(user.role!=='super_admin'&&!member)throw fail(403,'Agency access denied.');
 if(['provider','provider_plus'].includes(user.role)){
  const [[assigned]]=await pool.execute("SELECT id FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind='counseling' AND is_active=1 LIMIT 1",[clientId,agencyId,user.id]);
  if(!assigned)throw fail(403,'The assigned clinical care team must review this sharing.');
 }
 const [[a]]=await pool.execute('SELECT d.*,u.email FROM dependent_portal_access d JOIN users u ON u.id=d.user_id WHERE d.client_id=?',[clientId]);
 if(!a)return {invited:false};
 if(scopes!==undefined&&(reviewed!==true||!Array.isArray(scopes)||scopes.some(s=>!dependentRecordScopes.includes(s))))throw fail(400,'Review the clinical records appropriate for this client’s personal portal.');
 if(restore){
  if(reviewed!==true)throw fail(400,'Review the client’s authority and personal portal access before restoring it.');
  const db=await pool.getConnection();try{await db.beginTransaction();
   await db.execute('UPDATE client_guardians SET access_enabled=1 WHERE guardian_user_id=? AND client_id=?',[a.user_id,clientId]);
   await db.execute('UPDATE dependent_portal_access SET revoked_at=NULL WHERE user_id=?',[a.user_id]);
   await event(db,clientId,a.user_id,user.id,'restored',{agencyId,authorityReviewed:true});await db.commit();a.revoked_at=null;
  }catch(e){await db.rollback();throw e;}finally{db.release();}
 }
 if(scopes!==undefined){
  await pool.execute(`INSERT INTO dependent_portal_clinical_shares(user_id,agency_id,scopes_json,reviewed_by_user_id) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE scopes_json=VALUES(scopes_json),reviewed_by_user_id=VALUES(reviewed_by_user_id),reviewed_at=UTC_TIMESTAMP()`,[a.user_id,agencyId,JSON.stringify(scopes),user.id]);
  await event(pool,clientId,a.user_id,user.id,'clinical_sharing_reviewed',{agencyId,scopes});
 }
 const [[share]]=await pool.execute('SELECT scopes_json FROM dependent_portal_clinical_shares WHERE user_id=? AND agency_id=?',[a.user_id,agencyId]);
 return {invited:true,active:!a.revoked_at,email:a.email,scopes:typeof share?.scopes_json==='string'?JSON.parse(share.scopes_json):share?.scopes_json||[]};
}
