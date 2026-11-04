/** Default is read-only. Root/operator reviews the exact dry run before --apply.
 * Creates one application Group/identity; never sends, enables notices, changes
 * reviewer settings, provisions a Workspace user, or changes existing route pins. */
import {fileURLToPath} from 'node:url';
import pool from '../config/database.js';
import Directory from '../services/googleWorkspaceDirectory.service.js';
import Identity from '../models/EmailSenderIdentity.model.js';
import {ensureWorkspaceSenderGroup} from '../services/workspaceSenderGroup.service.js';
import {verifyWorkspaceRelaySender} from '../services/workspaceRelaySender.js';
import {relaySelected,relayConfiguration} from '../services/workspaceRelayConfig.js';
import {APP_GROUP_OWNER,APP_GROUP_MANAGER} from '../services/appGroupOwnership.service.js';

export const PEOPLE_OPS_SENDER_PLAN=Object.freeze({agencyId:2,email:'peopleops-notifications@itsco.health',
 identityKey:'people_operations_notifications',displayName:'People Operations',groupName:'ITSCO People Operations notifications',replyTo:'PO@itsco.health'});
const groupSettings={allowExternalMembers:false,whoCanJoin:'INVITED_CAN_JOIN',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',
 whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',whoCanPostMessage:'ANYONE_CAN_POST',includeInGlobalAddressList:false,isArchived:false};
const normalize=value=>String(value || '').trim().toLowerCase();

export async function configurePeopleOperationsSubmissionSender({apply=false}={},overrides={}) {
 const d={database:pool,directory:Directory,identities:Identity,ensureGroup:ensureWorkspaceSenderGroup,verify:verifyWorkspaceRelaySender,
  selected:relaySelected,configuration:relayConfiguration,...overrides},plan=PEOPLE_OPS_SENDER_PLAN;
 d.configuration();if(!d.selected(plan.email))throw new Error('The dedicated address must already select the verified domain relay. Do not change existing sender pins.');
 const [[agency]]=await d.database.execute('SELECT id,name,is_active,is_archived,feature_flags FROM agencies WHERE id=?',[plan.agencyId]);
 if(!agency||Number(agency.is_active)!==1||Number(agency.is_archived))throw new Error('The exact active agency was not found.');
 const before=JSON.stringify(agency.feature_flags),existing=await d.identities.findByAgencyAndIdentityKey(plan.agencyId,plan.identityKey,{includeInactive:true});
 if(existing&&normalize(existing.from_email)!==plan.email)throw new Error('The dedicated purpose is already bound to another sender. Review it without replacing the existing address.');
 const [conflicts]=await d.database.execute('SELECT id,agency_id,identity_key FROM email_sender_identities WHERE LOWER(from_email)=?',[plan.email]);
 if(conflicts.some(row=>Number(row.agency_id)!==plan.agencyId||row.identity_key!==plan.identityKey))throw new Error('This address belongs to another app identity. No changes made.');
 const group=await d.directory.getGroup({groupEmail:plan.email,strictNotFound:true});
 if(!group&&await d.directory.getUser({primaryEmail:plan.email}))throw new Error('The proposed Group address is already a user or alias. No account or alias will be changed.');
 if(group){
  const members=await d.directory.listGroupMembers(plan.email,{maxResults:5000});
  if(members.some(member=>![APP_GROUP_OWNER,APP_GROUP_MANAGER].includes(normalize(member.email)))||(!existing&&group.name!==plan.groupName))throw new Error('An unexpected Group already owns this address. Review its ownership before provisioning.');
 }
 const output={dryRun:!apply,applied:false,plan,groupExists:!!group,identityId:existing?.id || null,
  owner:{email:APP_GROUP_OWNER,role:'OWNER',delivery:'NONE'},manager:{email:APP_GROUP_MANAGER,role:'MANAGER',delivery:'ALL_MAIL'},
  groupSettings,transport:'workspace_smtp_relay',existingSenderPinsChanged:false,noticesActivationChanged:false,testMailSent:false};
 if(!apply)return output;
 const db=await d.database.getConnection();let locked=false;
 try{
  const [[lock]]=await db.execute("SELECT GET_LOCK('people-ops-submission-sender:2',5) AS acquired");locked=Number(lock?.acquired)===1;
  if(!locked)throw new Error('Another operator is preparing this sender. Retry after reviewing its result.');
  const ensured=await d.ensureGroup({email:plan.email,displayName:plan.groupName,directory:d.directory});
  if(ensured?.existingUser||!ensured?.group?.id)throw new Error('A dedicated Google Group is required. No Workspace user may be substituted.');
  await d.directory.applyGroupAccessSettings({groupEmail:plan.email,...groupSettings});
  await d.directory.setGroupMemberDeliverySettings({groupEmail:plan.email,memberEmail:APP_GROUP_OWNER,deliverySettings:'NONE'});
  await d.directory.setGroupMemberDeliverySettings({groupEmail:plan.email,memberEmail:APP_GROUP_MANAGER,deliverySettings:'ALL_MAIL'});
  let identity=await d.identities.findByAgencyAndIdentityKey(plan.agencyId,plan.identityKey,{includeInactive:true});
  if(identity&&normalize(identity.from_email)!==plan.email)throw new Error('The purpose changed concurrently. Review the existing sender.');
  const fields={displayName:plan.displayName,replyTo:plan.replyTo,isActive:true,inboundAddresses:[plan.email]};
  identity=identity?await d.identities.update(identity.id,fields):await d.identities.create({agencyId:plan.agencyId,identityKey:plan.identityKey,fromEmail:plan.email,...fields});
  await d.verify(plan.email,{db:d.database});
  const [[after]]=await d.database.execute('SELECT feature_flags FROM agencies WHERE id=?',[plan.agencyId]);
  if(JSON.stringify(after?.feature_flags)!==before)throw new Error('Agency settings changed during provisioning. Review them; this script did not activate notices.');
  return {...output,dryRun:false,applied:true,identityId:identity.id,groupVerified:true};
 }finally{try{if(locked)await db.execute("SELECT RELEASE_LOCK('people-ops-submission-sender:2')");}finally{db.release();}}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw new Error('Only --apply is supported; the tenant, address and purpose are fixed for review.');
  console.log(JSON.stringify(await configurePeopleOperationsSubmissionSender({apply:process.argv.includes('--apply')}),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}finally{await pool.end();}
}
