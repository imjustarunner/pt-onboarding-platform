import pool from '../../config/database.js';
import EmailSenderIdentity from '../../models/EmailSenderIdentity.model.js';
import {ensureSendAsAlias} from '../gmailSendAs.service.js';
import {getImpersonatedUser} from '../unifiedEmail/gmailClient.js';
import Directory from '../googleWorkspaceDirectory.service.js';
import { billingError, auditBilling } from '../familyBillingPolicy.service.js';
import { parseJson, requireBillingStaff } from './policy.js';

export function workspaceDomain(agency){const flags=parseJson(agency.feature_flags,{}),domain=String(flags.workspaceEmailDomain||agency.workspace_email_domain||'').trim().toLowerCase();if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw billingError(409,'Configure this organization’s verified Workspace email domain first');return domain;}
export async function seedBillingSenders(agencyId){
  const [agencies]=await pool.execute('SELECT * FROM agencies WHERE id=?',[agencyId]);if(!agencies.length)throw billingError(404,'Organization not found');
  const agency=agencies[0],domain=workspaceDomain(agency);
  for(const identity of ['billing','collections'])await pool.execute('INSERT IGNORE INTO family_billing_sender_provisioning (agency_id,identity_key,email_address) VALUES (?,?,?)',[agencyId,identity,`${identity}@${domain}`]);
  const [rows]=await pool.execute('SELECT * FROM family_billing_sender_provisioning WHERE agency_id=?',[agencyId]);return rows;
}
export async function provisionBillingSenders({agencyId,actorUserId,adoptExisting=false}){
  const [agencies]=await pool.execute('SELECT * FROM agencies WHERE id=?',[agencyId]);const agency=agencies[0];if(!agency)throw billingError(404,'Organization not found');
  const domain=workspaceDomain(agency),rows=await seedBillingSenders(agencyId);
  if(!Directory.isConfigured())throw billingError(409,'Workspace Directory is not configured');
  // Membership comes only from active, authorized agency billing staff. No guardians.
  const [users]=await pool.execute("SELECT u.* FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND (ua.has_billing_access=1 OR u.role IN ('admin','agency_admin','backoffice_admin')) AND u.status NOT IN ('ARCHIVED','INACTIVE_EMPLOYEE')",[agencyId]);
  const members=[];for(const user of users){await requireBillingStaff(user,agencyId);const email=String(user.work_email||user.email||'').toLowerCase();if(email.endsWith(`@${domain}`))members.push(email);}
  if(!members.length)throw billingError(409,'Assign an active billing staff member with a Workspace address before creating financial mailboxes');
  const results=[];
  for(const row of rows){
    const expected=`${row.identity_key}@${domain}`;
    if(row.email_address!==expected)throw billingError(409,'The Workspace domain changed. Review the existing billing mailbox before reprovisioning.');
    try{
      let group=await Directory.getGroup({groupEmail:expected});
      if(group&&!row.google_group_id&&!adoptExisting)throw billingError(409,'An existing group needs an administrator to verify its ownership before the app adopts it');
      if(group&&row.google_group_id&&String(group.id)!==String(row.google_group_id))throw billingError(409,'Workspace group ownership changed');
      if(!group){group=await Directory.createGroup({email:expected,name:`${agency.name} ${row.identity_key}`,description:`Managed financial correspondence for agency ${agencyId}`,allowExternalMembers:false,whoCanJoin:'INVITED_CAN_JOIN',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',includeInGlobalAddressList:false});await pool.execute('UPDATE family_billing_sender_provisioning SET google_group_id=? WHERE agency_id=? AND identity_key=?',[group.id,agencyId,row.identity_key]);}
      await Directory.applyGroupAccessSettings({groupEmail:expected,allowExternalMembers:false,whoCanJoin:'INVITED_CAN_JOIN',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',whoCanPostMessage:'ANYONE_CAN_POST',includeInGlobalAddressList:false,isArchived:false});
      const existing=await Directory.listGroupMembers(expected,{maxResults:5000});
      if((existing||[]).length>=5000)throw billingError(409,'Group membership requires manual review');
      if((existing||[]).some(m=>(m.type&&m.type!=='USER')||!members.includes(String(m.email||'').toLowerCase())))throw billingError(409,'The group has members outside authorized billing staff. Review its membership before activating it.');
      for(const email of [...new Set(members)])await Directory.addGroupMember({groupEmail:expected,memberEmail:email,role:'MEMBER'});
      let identity=await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId,row.identity_key);
      if(identity&&identity.from_email.toLowerCase()!==expected)throw billingError(409,'Review the existing sender address before changing it');
      if(!identity)identity=await EmailSenderIdentity.create({agencyId,identityKey:row.identity_key,displayName:`${agency.name} · ${row.identity_key==='billing'?'Billing':'Collections'}`,fromEmail:expected,replyTo:expected,inboundAddresses:[]});
      // Do not transfer another tenant's inbound route through an upsert.
      const [routes]=await pool.execute('SELECT sender_identity_id FROM email_inbound_routes WHERE LOWER(email_address)=LOWER(?)',[expected]);
      if(routes.some(r=>Number(r.sender_identity_id)!==Number(identity.id)))throw billingError(409,'This inbound address is already assigned to another sender');
      await EmailSenderIdentity.update(identity.id,{inboundAddresses:[expected]});
      const alias=await ensureSendAsAlias({impersonateUser:getImpersonatedUser(),sendAsEmail:expected,displayName:identity.display_name,replyToAddress:expected});
      if(!alias.ok||alias.sendAs?.verificationStatus!=='accepted')throw billingError(409,'Workspace send-as verification is required before this sender can be used');
      await pool.execute("UPDATE family_billing_sender_provisioning SET state='ready',sender_identity_id=?,google_group_id=?,last_error=NULL WHERE agency_id=? AND identity_key=?",[identity.id,group.id,agencyId,row.identity_key]);
      await auditBilling({agencyId,userId:actorUserId,action:'billing_sender_provisioned',objectId:identity.id});results.push({identity:row.identity_key,ready:true});
    }catch(e){await pool.execute("UPDATE family_billing_sender_provisioning SET state='failed',last_error=? WHERE agency_id=? AND identity_key=?",[e.status?e.message:'Workspace provisioning failed; inspect administrator configuration',agencyId,row.identity_key]);results.push({identity:row.identity_key,ready:false,message:e.status?e.message:'Workspace provisioning failed'});}
  }return results;
}
export async function requireReadySender(agencyId,key){
  const [rows]=await pool.execute("SELECT sender_identity_id FROM family_billing_sender_provisioning WHERE agency_id=? AND identity_key=? AND state='ready'",[agencyId,key]);
  const identity=rows.length?await EmailSenderIdentity.findById(rows[0].sender_identity_id):null;
  if(!identity||Number(identity.agency_id)!==Number(agencyId)||!identity.is_active)throw billingError(409,'Provision and verify this organization’s billing and collections senders first');return identity;
}
