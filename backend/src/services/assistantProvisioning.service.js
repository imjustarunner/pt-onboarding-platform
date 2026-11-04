import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import {managedDomain} from './managedWorkspaceGroupPolicy.js';
import {ASSISTANT_AGENCIES,ASSISTANT_CATALOG,ASSISTANT_OWNER_EMAIL,assistantError,defaultAssistantSchedule,publicAssistantAccount,assistantDigest,assistantStoredConfigurationHash,parseAssistantJson} from './assistantTeamPolicy.js';
import {recordAssistantChange} from './assistantAccountAlerts.service.js';

export async function countAssistantSchools(agencyId,db=pool){
 const [[r]]=await db.execute(`SELECT COUNT(DISTINCT s.id) n FROM agencies s JOIN (
 SELECT school_organization_id id FROM agency_schools WHERE agency_id=? AND is_active=1
 UNION SELECT organization_id id FROM organization_affiliations WHERE agency_id=? AND is_active=1
 ) links ON links.id=s.id WHERE s.organization_type='school' AND s.is_active=1 AND COALESCE(s.is_archived,0)=0`,[agencyId,agencyId]);return Number(r.n);
}
export async function assertAssistantOwner(actor,db=pool){
 const [[owner]]=await db.execute('SELECT id,email,role,is_active,is_archived FROM users WHERE id=?',[Number(actor?.id)||0]);
 if(!owner||owner.role!=='super_admin'||String(owner.email).toLowerCase()!==ASSISTANT_OWNER_EMAIL||!owner.is_active||owner.is_archived)throw assistantError(403,'ASSISTANT_OWNER_REQUIRED','Only Michael can manage Assistant Teams.');return owner;
}
export async function provisionAssistantAccounts({actor,agencyIds=ASSISTANT_AGENCIES,dryRun=true,qa=false},db=pool){
 await assertAssistantOwner(actor,db);
 const ids=[...new Set(agencyIds.map(Number))];const allowed=qa?[450,453]:ASSISTANT_AGENCIES;
 if(!ids.length||ids.some(id=>!allowed.includes(id)))throw assistantError(400,'AGENCY_NOT_ENROLLED','Select an enrolled assistant agency.');
 const plan=[];
 for(const agencyId of ids){
  const [[agency]]=await db.execute('SELECT id,name,slug,is_active,is_archived,organization_type,feature_flags FROM agencies WHERE id=?',[agencyId]);
  if(!agency||!agency.is_active||agency.is_archived)throw assistantError(409,'AGENCY_UNAVAILABLE','The selected agency is not active.');
  const domain=qa?({450:'itsco.health',453:'nextleveluplcc.com'}[agencyId]):managedDomain(agency);if(!domain)throw assistantError(409,'MANAGED_DOMAIN_REQUIRED','Verify the managed agency mail domain first.');
  const schools=await countAssistantSchools(agencyId,db);
  for(const role of ASSISTANT_CATALOG){
   if(role.key==='school_support'&&!schools){plan.push({agencyId,subrole:role.key,skipped:'NO_LINKED_SCHOOLS'});continue;}
   const local=role.key==='team_lead'?'assistant-team-lead':`${role.key.replaceAll('_','-')}-assistant`;
   const email=`${qa?`qa-${agencyId}-`:''}${local}@${domain}`;const displayName=`${agency.name} ${role.label}`;
   const [[existing]]=await db.execute('SELECT aa.*,u.email,CONCAT(u.first_name,\' \',u.last_name) display_name,a.name agency_name FROM assistant_accounts aa JOIN users u ON u.id=aa.user_id JOIN agencies a ON a.id=aa.agency_id WHERE aa.agency_id=? AND aa.subrole=?',[agencyId,role.key]);
   if(existing){if(existing.email.toLowerCase()!==email.toLowerCase())throw assistantError(409,'ASSISTANT_EMAIL_DRIFT','An existing assistant address requires owner review.');plan.push({existing:true,...publicAssistantAccount(existing)});continue;}
   if(dryRun){plan.push({agencyId,agencyName:agency.name,subrole:role.key,email,displayName,wouldCreate:true,status:'pending'});continue;}
   const conn=await db.getConnection();try{
    await conn.beginTransaction();
    const [[collision]]=await conn.execute('SELECT id FROM users WHERE LOWER(email)=? OR LOWER(username)=? OR LOWER(work_email)=? LIMIT 1',[email,email,email]);
    if(collision)throw assistantError(409,'ASSISTANT_EMAIL_COLLISION','This address belongs to another account; no account was converted.');
    const passwordHash=await bcrypt.hash(crypto.randomBytes(48).toString('base64url'),12);
    const [user]=await conn.execute(`INSERT INTO users(email,username,work_email,password_hash,role,status,first_name,last_name,is_active,is_archived,login_is_group_email,sso_password_override,is_assistant_account,sees_clients)
     VALUES (?,?,?,?,'assistant','ACTIVE_EMPLOYEE',?,?,1,0,1,1,1,0)`,[email,email,email,passwordHash,agency.name,role.label]);
    const schedule=defaultAssistantSchedule(role.key);
    const [account]=await conn.execute("INSERT INTO assistant_accounts(user_id,agency_id,subrole,capabilities_json,schedule_json,privacy_policy_json,credential_fingerprint) VALUES (?,?,?,'[]',?,'{}',?)",[user.insertId,agencyId,role.key,JSON.stringify(schedule),crypto.createHash('sha256').update(passwordHash).digest('hex')]);
    await conn.execute('INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES (?,?,1)',[user.insertId,agencyId]);
    await conn.execute('UPDATE assistant_accounts SET configuration_fingerprint=? WHERE id=?',[assistantStoredConfigurationHash({user_id:user.insertId,agency_id:agencyId,subrole:role.key,status:'pending',policy_revision:1,capabilities_json:[],schedule_json:schedule,baa_status:'pending',privacy_policy_json:{},group_status:'pending',group_snapshot_json:null}),account.insertId]);
    await recordAssistantChange(conn,{accountId:account.insertId,agencyId,actorUserId:actor.id,eventType:'account_created',changes:{email,subrole:role.key,status:'pending'},reason:'Owner requested isolated external assistant team'});
    await conn.commit();plan.push({id:account.insertId,userId:user.insertId,agencyId,subrole:role.key,email,displayName,status:'pending',credentialSetupRequired:true});
   }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  }
 }return {dryRun,qa,accounts:plan};
}
export async function provisionAssistantGroup({accountId,actor},deps={}){
 const db=deps.db||pool;await assertAssistantOwner(actor,db);const [[a]]=await db.execute('SELECT aa.*,u.email,CONCAT(u.first_name,\' \',u.last_name) display_name FROM assistant_accounts aa JOIN users u ON u.id=aa.user_id WHERE aa.id=?',[accountId]);if(!a)throw assistantError(404,'ASSISTANT_NOT_FOUND','Assistant account not found.');
 try{
  const {ensureWorkspaceSenderGroup}=await import('./workspaceSenderGroup.service.js');const {default:Directory}=await import('./googleWorkspaceDirectory.service.js');const {ensureSendAsAlias}=await import('./gmailSendAs.service.js');
  const directory=deps.directory||Directory;
  const group=await (deps.ensureGroup||ensureWorkspaceSenderGroup)({email:a.email,displayName:a.display_name,directory});
  if(group.existingUser||!group.group)throw assistantError(409,'ASSISTANT_GROUP_REQUIRED','The assistant address must be a Google Group, not a staff mailbox.');
  const settings=await directory.applyGroupAccessSettings({groupEmail:a.email,allowExternalMembers:false,whoCanJoin:'INVITED_CAN_JOIN',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',whoCanPostMessage:'ANYONE_CAN_POST',includeInGlobalAddressList:false});
  const sendAs=await (deps.ensureSendAs||ensureSendAsAlias)({sendAsEmail:a.email,displayName:a.display_name,replyToAddress:a.email});
  if(!sendAs.ok||sendAs.sendAs?.verificationStatus!=='accepted')throw assistantError(503,'ASSISTANT_SENDER_NOT_READY','The group exists; sender verification is still pending. Retry this account.');
  const members=await directory.listGroupMembers(a.email,{maxResults:1000});
  if(members.some(m=>![ASSISTANT_OWNER_EMAIL,'ai@plottwistco.com'].includes(String(m.email||'').toLowerCase())))throw assistantError(409,'ASSISTANT_GROUP_DRIFT','Unexpected group members require owner review.');
  const snapshot={groupId:group.group.id,members:members.map(m=>({email:String(m.email).toLowerCase(),role:m.role})).sort((x,y)=>x.email.localeCompare(y.email)),settings:{allowExternalMembers:String(settings.allowExternalMembers),whoCanJoin:settings.whoCanJoin,whoCanViewMembership:settings.whoCanViewMembership,whoCanViewGroup:settings.whoCanViewGroup,whoCanPostMessage:settings.whoCanPostMessage,includeInGlobalAddressList:String(settings.includeInGlobalAddressList)}};
  const conn=await db.getConnection();try{await conn.beginTransaction();await conn.execute("UPDATE assistant_accounts SET group_status='ready',group_snapshot_json=? WHERE id=?",[JSON.stringify(snapshot),a.id]);await conn.execute('UPDATE assistant_accounts SET configuration_fingerprint=? WHERE id=?',[assistantStoredConfigurationHash({...a,group_status:'ready',group_snapshot_json:snapshot}),a.id]);await recordAssistantChange(conn,{accountId:a.id,agencyId:a.agency_id,actorUserId:actor.id,eventType:'group_provisioned',changes:{groupStatus:'ready',email:a.email},reason:'Verified Google Group and accepted sender configuration'});await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
  return {id:a.id,groupStatus:'ready',senderVerification:'accepted'};
 }catch(error){
  const conn=await db.getConnection();try{await conn.beginTransaction();await conn.execute("UPDATE assistant_accounts SET group_status='failed',status=IF(status='active','paused',status) WHERE id=?",[a.id]);await conn.execute('UPDATE assistant_accounts SET configuration_fingerprint=? WHERE id=?',[assistantStoredConfigurationHash({...a,group_status:'failed',status:a.status==='active'?'paused':a.status}),a.id]);await recordAssistantChange(conn,{accountId:a.id,agencyId:a.agency_id,actorUserId:actor.id,eventType:'group_setup_failed',changes:{groupStatus:'failed'},reason:'Group setup failed or requires review; retry the existing account'});await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
  throw assistantError(error.status||503,error.code||'GROUP_SETUP_UNAVAILABLE','Group setup is incomplete. Retry the existing account after reviewing configuration.');
 }
}
