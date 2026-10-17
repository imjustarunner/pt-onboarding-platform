import { resolveWorkspaceSubject } from '../googleWorkspaceSubject.service.js';
import { APP_GROUP_OWNER } from '../appGroupOwnership.service.js';
import pool from '../../config/database.js';
import EmailSenderIdentity from '../../models/EmailSenderIdentity.model.js';
import {ensureSendAsAlias} from '../gmailSendAs.service.js';
import {getImpersonatedUser} from '../unifiedEmail/gmailClient.js';
import Directory from '../googleWorkspaceDirectory.service.js';
import { billingError, auditBilling } from '../familyBillingPolicy.service.js';
import { parseJson, requireBillingStaff } from './policy.js';
import { isBillingAgency } from '../billingAgencyPolicy.js';

export function billingSenderDefinition(agency,key='billing') {
  if(!isBillingAgency(agency))throw billingError(409,'Only active billing agencies can provision financial senders');
  if(key==='billing')return {key,email:`billing@${workspaceDomain(agency)}`,name:`${agency.name} · Billing`};
  if(key==='fundthred_collections'&&Number(agency.id)===1&&agency.slug==='plottwistco')return {key,email:'collections@fundthred.com',name:'FundThred · Plot Twist Co. Collections'};
  throw billingError(400,'Select practice billing or the PlotTwistCo FundThred collections sender');
}

export function workspaceDomain(agency){const flags=parseJson(agency.feature_flags,{}),domain=String(flags.workspaceEmailDomain||agency.workspace_email_domain||'').trim().toLowerCase();if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw billingError(409,'Configure this organization’s verified Workspace email domain first');return domain;}
export async function seedBillingSenders(agencyId,{identityKey='billing'}={}){
  const [agencies]=await pool.execute('SELECT * FROM agencies WHERE id=?',[agencyId]);if(!agencies.length)throw billingError(404,'Organization not found');
  const sender=billingSenderDefinition(agencies[0],identityKey);
  await pool.execute('INSERT IGNORE INTO family_billing_sender_provisioning (agency_id,identity_key,email_address) VALUES (?,?,?)',[agencyId,sender.key,sender.email]);
  const [rows]=await pool.execute('SELECT * FROM family_billing_sender_provisioning WHERE agency_id=?',[agencyId]);return rows;
}
export async function managedWorkspaceAddress(email){
  const user=await Directory.getUser({primaryEmail:email});
  return user&&!user.suspended&&!user.archived?String(user.primaryEmail||'').trim().toLowerCase():'';
}
export async function billingSenderMembers(agencyId,domain,{db=pool,authorize=requireBillingStaff,managedDomains=[],resolveAddress=async email=>email,memberUserIds=null,actorUserId=0}={}) {
  const [users]=await db.execute(`SELECT u.* FROM users u
    WHERE COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND u.status IN ('ACTIVE','ACTIVE_EMPLOYEE')
      AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.is_active=1
        AND (ua.has_billing_access=1 OR (u.role='super_admin' AND u.id=?))
        AND (ua.agency_id=? OR EXISTS(SELECT 1 FROM agency_billing_management bm
          WHERE bm.agency_id=? AND bm.manager_agency_id=ua.agency_id AND bm.is_active=1)))`,[actorUserId,agencyId,agencyId]);
  const members=[];
  for(const user of users){
    if(memberUserIds&&!memberUserIds.includes(Number(user.id)))continue;
    try{await authorize(user,agencyId,db);}catch(e){if(e.status===403)continue;throw e;}
    const address=String(user.work_email||user.email||'').trim().toLowerCase();
    const email=address?await resolveAddress(address):'';
    if([domain,...managedDomains].some(d=>d&&email.endsWith(`@${d}`)))members.push(email);
  }
  return [...new Set(members)];
}
export async function ensureBillingGroup({email,name,agencyId,groupId,adoptExisting,members,transport},{directory=Directory}={}) {
  // Canonical account IDs handle Workspace aliases without granting outside users access.
  const allowedEmails=new Set(),allowedIds=new Set();
  for(const address of [...new Set([...members,transport,APP_GROUP_OWNER].map(resolveWorkspaceSubject))]){
    const user=await directory.getUser({primaryEmail:address});
    if(!user||user.suspended||user.archived)throw billingError(409,'A billing group member is not an active managed Workspace user');
    allowedEmails.add(address.toLowerCase());allowedEmails.add(user.primaryEmail.toLowerCase());allowedIds.add(String(user.id));
  }
  let group=await directory.getGroup({groupEmail:email,strictNotFound:true});
  if(group&&!groupId&&!adoptExisting)throw billingError(409,'Review ownership before adopting this existing billing group');
  if(groupId&&(!group||String(group.id)!==String(groupId)))throw billingError(409,'Workspace group ownership changed');
  const existing=group?await directory.listGroupMembers(email,{maxResults:5000}):[];
  if(existing.length>=5000||existing.some(m=>m.type!=='USER'||!(allowedIds.has(String(m.id))||allowedEmails.has(String(m.email).toLowerCase()))))throw billingError(409,'The group has members outside authorized billing staff. Review its membership before activating it.');
  // Existing posting/access settings are preserved. New groups start private.
  if(!group){
    group=await directory.createGroup({email,name,description:`Managed financial correspondence for agency ${agencyId}`,allowExternalMembers:false,whoCanJoin:'INVITED_CAN_JOIN',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',whoCanPostMessage:'ALL_MEMBERS_CAN_POST',includeInGlobalAddressList:false});
    await directory.applyGroupAccessSettings({groupEmail:email,allowExternalMembers:false,whoCanJoin:'INVITED_CAN_JOIN',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',whoCanPostMessage:'ALL_MEMBERS_CAN_POST',includeInGlobalAddressList:false,isArchived:false});
  }
  for(const address of [...new Set([...members,transport,APP_GROUP_OWNER].map(resolveWorkspaceSubject))])await directory.addGroupMember({groupEmail:email,memberEmail:address,role:'MEMBER',memberType:'USER'});
  const delivery=await directory.setGroupMemberDeliverySettings({groupEmail:email,memberEmail:transport,deliverySettings:'ALL_MAIL'});
  if(delivery?.delivery_settings!=='ALL_MAIL')throw billingError(409,'Confirm delivery to the app sending account before activating this sender');
  return group;
}
export async function provisionBillingSenders({agencyId,actorUserId,adoptExisting=false,identityKey='billing',memberUserIds=null}){
  const [agencies]=await pool.execute('SELECT * FROM agencies WHERE id=?',[agencyId]);const agency=agencies[0];if(!agency)throw billingError(404,'Organization not found');
  const definition=billingSenderDefinition(agency,identityKey),domain=workspaceDomain(agency),rows=await seedBillingSenders(agencyId,{identityKey});
  if(!Directory.isConfigured())throw billingError(409,'Workspace Directory is not configured');
  // Membership comes only from active, authorized agency billing staff. No guardians.
  const [managers]=await pool.execute('SELECT a.feature_flags FROM agency_billing_management bm JOIN agencies a ON a.id=bm.manager_agency_id WHERE bm.agency_id=? AND bm.is_active=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0',[agencyId]);
  const managedDomains=managers.map(a=>workspaceDomain(a));
  const members=await billingSenderMembers(agencyId,domain,{managedDomains,resolveAddress:managedWorkspaceAddress,memberUserIds,actorUserId});
  if(!members.length)throw billingError(409,'Assign an active billing staff member with a Workspace address before creating financial mailboxes');
  const transport=String(getImpersonatedUser()||'').trim().toLowerCase();
  const results=[];
  for(const row of rows.filter(r=>r.identity_key===identityKey)){
    const expected=definition.email;
    if(row.email_address!==expected)throw billingError(409,'The Workspace domain changed. Review the existing billing mailbox before reprovisioning.');
    try{
      const group=await ensureBillingGroup({email:expected,name:definition.name,agencyId,groupId:row.google_group_id,adoptExisting,members,transport});
      await pool.execute('UPDATE family_billing_sender_provisioning SET google_group_id=? WHERE agency_id=? AND identity_key=?',[group.id,agencyId,row.identity_key]);
      let identity=await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId,row.identity_key);
      if(identity&&identity.from_email.toLowerCase()!==expected)throw billingError(409,'Review the existing sender address before changing it');
      if(!identity)identity=await EmailSenderIdentity.create({agencyId,identityKey:row.identity_key,displayName:definition.name,fromEmail:expected,replyTo:expected,inboundAddresses:[]});
      // Do not transfer another tenant's inbound route through an upsert.
      const [routes]=await pool.execute('SELECT sender_identity_id FROM email_inbound_routes WHERE LOWER(email_address)=LOWER(?)',[expected]);
      if(routes.some(r=>Number(r.sender_identity_id)!==Number(identity.id)))throw billingError(409,'This inbound address is already assigned to another sender');
      await EmailSenderIdentity.update(identity.id,{displayName:definition.name,replyTo:expected,inboundAddresses:[expected]});
      const alias=await ensureSendAsAlias({impersonateUser:transport,sendAsEmail:expected,displayName:definition.name,replyToAddress:expected});
      if(!alias.ok||alias.sendAs?.verificationStatus!=='accepted')throw billingError(409,'Workspace send-as verification is required before this sender can be used');
      await pool.execute("UPDATE family_billing_sender_provisioning SET state='ready',sender_identity_id=?,google_group_id=?,last_error=NULL WHERE agency_id=? AND identity_key=?",[identity.id,group.id,agencyId,row.identity_key]);
      await auditBilling({agencyId,userId:actorUserId,action:'billing_sender_provisioned',objectId:identity.id});results.push({identity:row.identity_key,ready:true});
    }catch(e){await pool.execute("UPDATE family_billing_sender_provisioning SET state='failed',last_error=? WHERE agency_id=? AND identity_key=?",[e.status?e.message:'Workspace provisioning failed; inspect administrator configuration',agencyId,row.identity_key]);results.push({identity:row.identity_key,ready:false,message:e.status?e.message:'Workspace provisioning failed'});}
  }return results;
}
export async function requireReadySender(agencyId,key){
  const [rows]=await pool.execute("SELECT sender_identity_id FROM family_billing_sender_provisioning WHERE agency_id=? AND identity_key=? AND state='ready'",[agencyId,key]);
  const identity=rows.length?await EmailSenderIdentity.findById(rows[0].sender_identity_id):null;
  if(!identity||Number(identity.agency_id)!==Number(agencyId)||!identity.is_active)throw billingError(409,'Provision and verify this organization’s requested sender first');return identity;
}
