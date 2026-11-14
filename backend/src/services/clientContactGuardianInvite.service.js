import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientContactAffiliation from '../models/ClientContactAffiliation.model.js';
import { createCoGuardianInvite } from './coGuardianInvite.service.js';
import { requireReminderGuardian } from './clientContactAffiliation.service.js';

const fail = message => Object.assign(new Error(message), {status:409});
export async function inviteContactAsGuardian({clientId,affiliationId,userId}, overrides={}) {
  const deps={database:pool,clients:Client,guardians:ClientGuardian,contacts:ClientContactAffiliation,invite:createCoGuardianInvite,authorize:requireReminderGuardian,...overrides};
  await deps.authorize(clientId,userId);
  const client=await deps.clients.findById(clientId);
  if(!client || Number(client.guardian_portal_enabled)!==1)throw fail('Finalize the client’s enrollment before inviting a secondary guardian.');
  const contact=await deps.contacts.findById(affiliationId);
  if(!contact || Number(contact.client_id)!==Number(clientId) || Number(contact.is_active)!==1 || Number(contact.contact_is_active)!==1 || Number(contact.agency_id)!==Number(client.agency_id))throw fail('Select an active contact on this client.');
  if(!['parent','guardian'].includes(String(contact.relationship_type).toLowerCase()))throw fail('Only a parent or guardian contact can be invited as a secondary guardian.');
  const email=String(contact.contact_email || '').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Add the other parent’s own email before inviting them.');
  const db=await deps.database.getConnection();let locked=false;
  const key=`client-secondary-guardian:${Number(clientId)}`;
  try {
    const [[lock]]=await db.execute('SELECT GET_LOCK(?,3) AS acquired',[key]);
    if(Number(lock?.acquired)!==1)throw fail('Another invitation is being prepared. Refresh before trying again.');locked=true;
    const links=await deps.guardians.listForClient(clientId);
    if(links.some(row=>String(row.email || '').toLowerCase()===email))throw fail('This parent already has a linked guardian account. Manage its invitation from the client’s portal accounts.');
    if(links.filter(row=>row.relationship_type!=='self' && Number(row.access_enabled)===1).length>=2)throw fail('Two guardian accounts are already linked. Ask the care team to review access.');
    const [pending]=await db.execute(`SELECT i.id FROM co_guardian_invites i JOIN co_guardian_invite_clients ic ON ic.invite_id=i.id
      WHERE ic.client_id=? AND i.agency_id=? AND LOWER(i.invited_email)=? AND i.status='pending' AND i.expires_at>NOW() LIMIT 1`,[clientId,client.agency_id,email]);
    if(pending.length)throw fail('This parent already has a pending invitation. Manage or resend the existing secondary-guardian invitation.');
    const names=String(contact.contact_full_name || '').trim().split(/\s+/);
    const result=await deps.invite({agencyId:client.agency_id,invitedByUserId:userId,clientIds:[Number(clientId)],source:client.client_type==='school'?'school':'office',enablePortalOnMatch:false,
      otherGuardian:{firstName:names.shift() || 'Parent',lastName:names.join(' '),email,phone:contact.contact_phone || '',relationship:contact.relationship_type,sendInvite:true},sendEmail:true});
    // The private setup token stays in the invitation delivery, never in a contact response.
    return {inviteId:result.inviteId,emailed:result.emailed,queued:result.queued,deliveryStatus:result.deliveryStatus};
  } finally {try{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[key]);}finally{db.release();}}
}
