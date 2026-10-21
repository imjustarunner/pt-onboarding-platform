import User from '../models/User.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import Client from '../models/Client.model.js';
import ClientGuardianIntakeProfile from '../models/ClientGuardianIntakeProfile.model.js';
import pool from '../config/database.js';
import {resolveClientRecordAccess} from './clientRecordAccess.service.js';
const error=(message,status=409)=>Object.assign(new Error(message),{status});
const emailOf=profile=>String(profile?.email||'').trim().toLowerCase();

/** Account preparation sends nothing and grants no new chart access from a contact alone. */
export async function prepareGuardianAccount({client,profile,actorUserId=null}, deps={User,ClientGuardian}) {
  const email=emailOf(profile);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {prepared:false,reason:'A valid guardian email is required.'};
  let user=await deps.User.findByEmail(email),created=false;
  if(user&&!['client_guardian','guardian','client'].includes(String(user.role).toLowerCase()))return {prepared:false,reason:'This email belongs to a staff account; identity review is required.'};
  if(!user){
    try {user=await deps.User.create({email,personalEmail:email,firstName:profile.firstName||profile.fullName||'Guardian',lastName:profile.lastName||'',phoneNumber:profile.phone||null,passwordHash:null,role:'client_guardian',status:'PENDING_SETUP'});created=true;}
    catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;user=await deps.User.findByEmail(email);if(!user||!['client_guardian','guardian','client'].includes(user.role))throw error('Account identity changed; review before linking.');}
  }
  const existing=await deps.ClientGuardian.getLink({clientId:client.id,guardianUserId:user.id});
  await deps.User.assignToAgency(user.id,Number(client.agency_id));
  if(!existing)await deps.ClientGuardian.upsertLink({clientId:client.id,guardianUserId:user.id,relationshipType:'guardian',relationshipTitle:profile.relationship||'Guardian',accessEnabled:false,permissionsJson:{pendingGuardianVerification:true,accountPreparationSource:'saved_guardian_contact'},createdByUserId:actorUserId});
  return {prepared:true,created,userId:user.id,accessEnabled:Number(existing?.access_enabled)===1,requiresAccessReview:!existing||Number(existing.access_enabled)!==1,invitationSent:false};
}

/** Explicit staff preparation, separate from the later invitation operation. */
export async function prepareGuardianAccountsForClients({actor,agencyId,clientIds,dryRun=true}) {
  if(!['admin','super_admin','support','staff'].includes(actor?.role))throw error('Account staff access is required.',403);
  if(!Array.isArray(clientIds)||!clientIds.length||clientIds.length>200||clientIds.some(id=>!Number.isSafeInteger(Number(id))||Number(id)<1))throw error('Select 1–200 clients.',400);
  const results=[], authorizedClients=[];
  for(const id of [...new Set(clientIds.map(Number))]) {
    const access=await resolveClientRecordAccess({userId:actor.id,role:actor.role,clientId:id});
    const client=await Client.findById(id);
    if(!access.ok||Number(client?.agency_id)!==Number(agencyId))throw error('Every selected client must belong to your authorized agency.',403);
    authorizedClients.push(client);
  }
  for (const client of authorizedClients) {
    const id=Number(client.id);
    const primary=await ClientGuardianIntakeProfile.findByClientId(id);
    const [secondary]=await pool.execute("SELECT i.invited_first_name firstName,i.invited_last_name lastName,i.invited_email email,i.relationship_title relationship FROM co_guardian_invites i JOIN co_guardian_invite_clients ic ON ic.invite_id=i.id WHERE ic.client_id=? AND i.agency_id=? AND i.status IN ('pending','accepted')",[id,agencyId]);
    const seen=new Set();
    for(const profile of [primary,...secondary].filter(Boolean)) {
      const email=emailOf(profile);if(seen.has(email))continue;seen.add(email);
      if(dryRun){const user=email?await User.findByEmail(email):null;results.push({clientId:id,email,existingAccount:!!user,validEmail:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),invitationSent:false});}
      else results.push({clientId:id,...await prepareGuardianAccount({client,profile,actorUserId:actor.id})});
    }
  }
  return {dryRun,results,invitationSent:false};
}
