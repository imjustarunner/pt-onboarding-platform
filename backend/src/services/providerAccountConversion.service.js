import {randomUUID} from 'node:crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import Directory from './googleWorkspaceDirectory.service.js';
import {parseGoogleWorkspaceServiceAccountFromEnv} from './googleWorkspaceAuth.service.js';
import {ensureAppGroupOwnership,APP_GROUP_OWNER,APP_GROUP_MANAGER} from './appGroupOwnership.service.js';
import {ensureHireGroupSender} from './hireGroupEmail.service.js';
import {ensurePersonalMailboxForAddress} from './personalMailbox.service.js';
import {readStaffCareEligibility} from './staffCareEligibility.service.js';
import {evaluateClientSessionBooking,readClientSessionBookingRollout,saveClientSessionBookingRollout} from './clientSessionBookingRollout.service.js';
const email=value=>String(value || '').trim().toLowerCase();
const positive=value=>Number.isSafeInteger(Number(value)) && Number(value)>0;
const enabled=value=>[true,1,'1'].includes(value);
const error=(message,code='PROVIDER_CONVERSION_NOT_READY',status=409)=>Object.assign(new Error(message),{status,code});
const marker=id=>`ITSCO provider conversion ${id}`;
const defaults={db:pool,users:User,agencies:Agency,directory:Directory,care:readStaffCareEligibility,sender:ensureHireGroupSender,inbox:ensurePersonalMailboxForAddress,ownership:ensureAppGroupOwnership,readRollout:readClientSessionBookingRollout,saveRollout:saveClientSessionBookingRollout};
async function context({actor,agencyId,providerUserId},deps) {
 if(Number(agencyId)!==2 || !positive(providerUserId) || !positive(actor?.id) || !['admin','super_admin'].includes(actor?.role) || actor.isAutomation || actor.isServiceAccount || actor.impersonatedBy)throw error('ITSCO administrator access is required.','PROVIDER_CONVERSION_FORBIDDEN',403);
 const human=await deps.users.findById(actor.id),provider=await deps.users.findById(providerUserId);
 if(!human || !enabled(human.is_active) || !['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(human.status || '').toUpperCase()) || enabled(human.is_archived) || enabled(human.is_demo) || !['admin','super_admin'].includes(human.role))throw error('An active human administrator is required.','PROVIDER_CONVERSION_FORBIDDEN',403);
 const memberships=await deps.users.getAgencies(actor.id);
 if(human.role!=='super_admin' && !memberships.some(row=>Number(row.id)===2 && row.is_active!==0))throw error('ITSCO administrator membership is required.','PROVIDER_CONVERSION_FORBIDDEN',403);
 if(!provider || enabled(provider.is_demo) || !(await deps.care(providerUserId,2)).canProvideCare)throw error('Select an active ITSCO clinical provider.','PROVIDER_CONVERSION_FORBIDDEN',403);
 const agency=await deps.agencies.findById(2),flags=typeof agency?.feature_flags==='string'?JSON.parse(agency.feature_flags):agency?.feature_flags || {};
 const domain=email(flags.workspaceEmailDomain || agency?.workspace_email_domain || 'itsco.health').replace(/^@/,'');
 const target=email(provider.work_email),recovery=email(provider.personal_email);
 if(!target.endsWith('@'+domain) || !/^[^@\s]+@[^@\s]+$/.test(target))throw error('The provider needs their current individual work email in the ITSCO domain.');
 if(!/^[^@\s]+@[^@\s]+$/.test(recovery) || recovery===target || recovery.endsWith('@'+domain))throw error('Record a separate personal recovery recipient before starting.');
 const [[collision]]=await deps.db.execute('SELECT user_id FROM user_login_emails WHERE LOWER(email)=? AND user_id<>? LIMIT 1',[target,providerUserId]);
 const [[otherAccount]]=await deps.db.execute('SELECT id FROM users WHERE id<>? AND (LOWER(email)=? OR LOWER(work_email)=? OR LOWER(username)=?) LIMIT 1',[providerUserId,target,target,target]);
 const account=await deps.users.findByEmail(target);
 if(collision || otherAccount || account && Number(account.id)!==Number(providerUserId))throw error('The work address belongs to another app identity. Resolve this collision before conversion.');
 return {provider,agency,target,recovery};
}
async function read(deps,providerUserId,executor=deps.db,lock=false){const [[row]]=await executor.execute(`SELECT * FROM provider_account_conversions WHERE agency_id=2 AND provider_user_id=?${lock?' FOR UPDATE':''}`,[providerUserId]);return row || null;}
async function audit(deps,row,actor,event,evidence={},executor=deps.db){
 // Record the actual service identity and delegation separately from the human request.
 const configured=parseGoogleWorkspaceServiceAccountFromEnv();
 await executor.execute('INSERT INTO provider_account_conversion_events(conversion_id,agency_id,provider_user_id,initiated_by_user_id,event_type,automation_principal,delegation_subject,evidence_json) VALUES(?,2,?,?,?,?,?,?)',[row.id,row.provider_user_id,actor.id,event,configured?.client_email || null,email(process.env.GOOGLE_WORKSPACE_DIRECTORY_IMPERSONATE_USER || process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER) || null,JSON.stringify(evidence)]);
}
function unchanged(row,ctx){if(row && (row.target_email!==ctx.target || row.recovery_email!==ctx.recovery))throw error('The work or recovery email changed. An administrator must review this conversion before continuing.');}
function passwordEvidence(provider,row){const stampAvailable=Object.prototype.hasOwnProperty.call(provider,'password_changed_at');return {passwordStampAvailable:stampAvailable,passwordResetVerified:!!(provider.password_hash && !provider.temporary_password_hash && row?.password_prepared_at && provider.password_changed_at && new Date(provider.password_changed_at)>new Date(row.password_prepared_at))};}
function dto(row,ctx){return {conversion:row?{id:row.id,revision:row.revision,state:row.state,targetEmail:row.target_email,originalWorkspaceUserId:row.original_workspace_user_id,originalWorkspaceEmail:row.original_workspace_email,groupId:row.group_id,lastErrorCode:row.last_error_code}:null,targetEmail:ctx.target,recoveryEmail:ctx.recovery,...passwordEvidence(ctx.provider,row)};}
async function originalState(deps,row){const original=await deps.directory.getUser({primaryEmail:row.original_workspace_user_id});if(!original || String(original.id)!==String(row.original_workspace_user_id))throw error('The preserved original Workspace account could not be verified.');return original;}
async function verifyGroup(deps,row,actorUserId){
 const group=await deps.directory.getGroup({groupEmail:row.target_email,strictNotFound:true});
 if(!group || row.group_id && String(group.id)!==String(row.group_id) || !String(group.description || '').includes(marker(row.id)))throw error('The Group is missing or is not owned by this conversion.');
 const admin=await deps.directory.getClient();await deps.ownership({admin,groupKey:group.id || row.target_email});
 const members=await deps.directory.listGroupMembers(row.target_email,{client:admin});
 if(members.some(member=>![APP_GROUP_OWNER,APP_GROUP_MANAGER].includes(email(member.email))))throw error('Unexpected Group members need administrator review before activation. Existing members were not removed.');
 const settings=await deps.directory.applyGroupAccessSettings({groupEmail:row.target_email,allowExternalMembers:false,whoCanJoin:'INVITED_CAN_JOIN',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',whoCanPostMessage:'ANYONE_CAN_POST',isArchived:true});
 if(![false,'false'].includes(settings.allowExternalMembers) || settings.whoCanJoin!=='INVITED_CAN_JOIN' || settings.whoCanViewGroup!=='ALL_MEMBERS_CAN_VIEW')throw error('The Group access settings did not verify.');
 await deps.sender({email:row.target_email,displayName:[row.provider_first_name,row.provider_last_name].filter(Boolean).join(' ')});
 const [[collision]]=await deps.db.execute("SELECT id FROM communication_inboxes WHERE agency_id=2 AND LOWER(from_email)=? AND is_active=1 AND (owner_user_id<>? OR kind<>'personal') LIMIT 1",[row.target_email,row.provider_user_id]);
 if(collision)throw error('An existing app inbox routes this address to another owner. Resolve it before continuing.');
 const inbox=await deps.inbox({agencyId:2,userId:row.provider_user_id,fromEmail:row.target_email,actorUserId});
 if(!inbox?.id || Number(inbox.agency_id)!==2 || Number(inbox.owner_user_id)!==Number(row.provider_user_id) || email(inbox.from_email)!==row.target_email || !enabled(inbox.is_active))throw error('The provider’s app inbox ownership and delivery route did not verify.');
 return group;
}
export async function previewProviderConversion(input,dependencies={}){
 const deps={...defaults,...dependencies},ctx=await context(input,deps),row=await read(deps,input.providerUserId);unchanged(row,ctx);
 const result=dto(row,ctx);
 if(!deps.directory.isConfigured())return {...result,ready:false,message:'Workspace Directory automation is not configured.'};
 const original=row?await originalState(deps,row):await deps.directory.getUser({primaryEmail:input.originalWorkspaceUserId || ctx.target});
 return {...result,originalWorkspace:original?{id:String(original.id),email:original.primaryEmail,suspended:original.suspended===true}:null,message:row?'Keep the preserved original Workspace user suspended, rename it outside this app, and remove the original address from its aliases. Disabling alone does not release the address.':'Suspend the original Workspace user before capturing its identity, then release its address outside this app. No account is renamed or deleted here.'};
}
export async function captureProviderConversion(input,dependencies={}){
 const deps={...defaults,...dependencies},ctx=await context(input,deps);
 if(input.confirmed!==true || email(input.confirmRecoveryEmail)!==ctx.recovery)throw error('Confirm this exact work identity and separate recovery recipient.');
 if(!deps.directory.isConfigured())throw error('Workspace Directory automation is not configured.');
 const existing=await read(deps,input.providerUserId);if(existing){unchanged(existing,ctx);return dto(existing,ctx);}
 const rollout=await deps.readRollout(2,deps.db);
 if(evaluateClientSessionBooking(rollout,input.providerUserId).enabled)throw error('Pause this provider’s self-scheduling before starting their account conversion.');
 const original=await deps.directory.getUser({primaryEmail:input.originalWorkspaceUserId || ctx.target});
 if(!original?.id)throw error('Provide the preserved original Google user ID if its address was already renamed.');
 if(original.suspended!==true)throw error('Suspend the original Workspace user before starting this conversion. Preview remains available without changing the account.');
 if(email(original.primaryEmail)!==ctx.target && input.originalIdentityReviewed!==true)throw error('Confirm that the supplied preserved Google user ID belongs to this provider.');
 const row={id:randomUUID(),provider_user_id:Number(input.providerUserId),original_workspace_user_id:String(original.id),original_workspace_email:email(original.primaryEmail),target_email:ctx.target,recovery_email:ctx.recovery,state:'captured',revision:1};
 const db=await deps.db.getConnection();try{await db.beginTransaction();await db.execute('INSERT INTO provider_account_conversions(id,agency_id,provider_user_id,target_email,original_workspace_user_id,original_workspace_email,recovery_email,requested_by_user_id) VALUES(?,2,?,?,?,?,?,?)',[row.id,row.provider_user_id,row.target_email,row.original_workspace_user_id,row.original_workspace_email,row.recovery_email,input.actor.id]);await audit(deps,row,input.actor,'original_identity_captured',{originalGoogleId:row.original_workspace_user_id,targetEmail:row.target_email,existingAccountPreserved:true},db);await db.commit();}catch(cause){await db.rollback();throw cause;}finally{db.release();}return dto(row,ctx);
}
export async function prepareProviderConversion(input,dependencies={}){
 const deps={...defaults,...dependencies},ctx=await context(input,deps);let row=await read(deps,input.providerUserId);unchanged(row,ctx);
 if(!row || Number(input.revision)!==Number(row.revision) || input.confirmed!==true || email(input.confirmRecoveryEmail)!==ctx.recovery)throw error('Refresh the conversion and confirm its exact recovery recipient.');
 if(['active','password_pending','ready'].includes(row.state))return dto(row,ctx);
 if(row.state!=='captured')throw error('This conversion needs administrator review before preparation.');
 const db=await deps.db.getConnection();
 try{
  await db.beginTransaction();row=await read(deps,input.providerUserId,db,true);
  if(Number(input.revision)!==Number(row.revision))throw error('The conversion changed. Refresh before continuing.');
  const [[lockedUser]]=await db.execute('SELECT id,work_email,personal_email FROM users WHERE id=? FOR UPDATE',[row.provider_user_id]);
  if(!lockedUser || email(lockedUser.work_email)!==ctx.target || email(lockedUser.personal_email)!==ctx.recovery || !(await deps.care(row.provider_user_id,2,db)).canProvideCare)throw error('The provider identity or care eligibility changed. Refresh before continuing.');
  const original=await originalState(deps,row);
  if(original.suspended!==true)throw error('Suspend the original Workspace user outside this app before continuing.');
  if(email(original.primaryEmail)===ctx.target || [...(original.aliases || []),...(original.nonEditableAliases || [])].some(value=>email(value)===ctx.target) || await deps.directory.getUser({primaryEmail:ctx.target}))throw error('The original address is still a Google user or alias. Rename the preserved user and release this address outside the app.');
  let group=await deps.directory.getGroup({groupEmail:ctx.target,strictNotFound:true});
  if(group && (!String(group.description || '').includes(marker(row.id)) || row.group_id && String(row.group_id)!==String(group.id)))throw error('Another Group already owns this address. It will not be adopted or overwritten.');
  if(!group)group=await deps.directory.createGroup({email:ctx.target,name:[ctx.provider.first_name,ctx.provider.last_name].filter(Boolean).join(' ').slice(0,73),description:marker(row.id)+'; original Workspace account preserved.'});
  row.group_id=String(group.id);await verifyGroup(deps,row,input.actor.id);
  await db.execute('UPDATE users SET sso_password_override=1,login_is_group_email=1 WHERE id=?',[row.provider_user_id]);
  await db.execute("UPDATE provider_account_conversions SET group_id=?,state='password_pending',password_prepared_at=UTC_TIMESTAMP(),revision=revision+1,last_error_code=NULL WHERE id=?",[row.group_id,row.id]);
  await audit(deps,row,input.actor,'group_verified_password_mode_prepared',{groupId:row.group_id,originalGoogleId:row.original_workspace_user_id,selfSchedulingEnabled:false},db);
  await db.commit();return dto(await read(deps,input.providerUserId),ctx);
 }catch(cause){await db.rollback();await audit(deps,row,input.actor,'prepare_blocked',{code:cause.code || 'DIRECTORY_OR_STORAGE_UNAVAILABLE'}).catch(()=>{});throw cause;}finally{db.release();}
}
export async function activateProviderConversion(input,dependencies={}){
 const deps={...defaults,...dependencies},ctx=await context(input,deps),row=await read(deps,input.providerUserId);unchanged(row,ctx);
 if(row?.state==='active')return dto(row,ctx);
 if(!row || !['password_pending','ready'].includes(row.state) || Number(input.revision)!==Number(row.revision))throw error('Prepare and verify this provider’s Group first.');
 if(input.confirmed!==true || input.deliveryConfirmed!==true || email(input.confirmRecoveryEmail)!==ctx.recovery || !String(input.deliveryEvidence || '').trim())throw error('Confirm actual mail delivery and this exact personal recovery recipient.');
 const proof=passwordEvidence(ctx.provider,row);
 if(!proof.passwordResetVerified && (proof.passwordStampAvailable || input.passwordAccessConfirmed!==true || !ctx.provider.password_hash || ctx.provider.temporary_password_hash))throw error('The provider must set a lasting password after Group setup. Use their normal Set / Reset Password workflow.');
 if(!enabled(ctx.provider.sso_password_override) || !enabled(ctx.provider.login_is_group_email))throw error('Password sign-in setup changed. Review the account before activation.');
 const original=await originalState(deps,row);if(original.suspended!==true)throw error('Keep the preserved original Workspace user suspended during conversion.');
 await verifyGroup(deps,row,input.actor.id);
 const policy=await deps.readRollout(2,deps.db);
 // The explicit provider override remains closed while state is pending. Finish
 // account readiness first, then use the existing revisioned rollout audit path.
 const [reserved]=await deps.db.execute("UPDATE provider_account_conversions SET state='ready',revision=revision+1 WHERE id=? AND revision=?",[row.id,row.revision]);
 if(Number(reserved.affectedRows)!==1)throw error('The conversion changed. Refresh before activation.');
 try{
  await deps.saveRollout({agencyId:2,actorUserId:input.actor.id,conversionId:row.id,input:{providerUserIds:[row.provider_user_id],enabled:true,transitionReviewed:true,note:'Individual account conversion verified; password access and delivery confirmed.',revision:policy.revision}},deps.db);
  const finish=await deps.db.getConnection();try{await finish.beginTransaction();const [[lockedUser]]=await finish.execute('SELECT id,work_email,personal_email,sso_password_override,login_is_group_email,is_active,is_archived FROM users WHERE id=? FOR UPDATE',[row.provider_user_id]);if(!lockedUser || email(lockedUser.work_email)!==ctx.target || email(lockedUser.personal_email)!==ctx.recovery || !enabled(lockedUser.sso_password_override) || !enabled(lockedUser.login_is_group_email) || !enabled(lockedUser.is_active) || enabled(lockedUser.is_archived) || !(await deps.care(row.provider_user_id,2,finish)).canProvideCare)throw error('The provider account changed during activation. Scheduling remains closed.');await audit(deps,row,input.actor,'provider_self_scheduling_activated',{groupId:row.group_id,passwordResetVerified:proof.passwordResetVerified,passwordAccessAttested:input.passwordAccessConfirmed===true,deliveryConfirmed:true,deliveryEvidence:String(input.deliveryEvidence).trim().slice(0,1000)},finish);await finish.execute("UPDATE provider_account_conversions SET state='active',activated_at=UTC_TIMESTAMP(),revision=revision+1 WHERE id=?",[row.id]);await finish.commit();}catch(cause){await finish.rollback();throw cause;}finally{finish.release();}
 }catch(cause){await deps.db.execute("UPDATE provider_account_conversions SET state='password_pending',revision=revision+1 WHERE id=?",[row.id]);throw cause;}
 return dto(await read(deps,input.providerUserId),ctx);
}
