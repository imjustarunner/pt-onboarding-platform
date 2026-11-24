import {documentEmailPolicy} from './clinicalDocumentShareQa.js';
import directory from '../config/database.js';
import Client from '../models/Client.model.js';
import { ageOn } from './guardianClinicalAccess.service.js';
import { requireGuardianPlanAccess } from './guardianPlanProgress.service.js';
import { recipientAccess } from './safetyPlans/access.js';
import { fail } from './safetyPlans/template.js';
import { familyNotificationDeliveryGate } from './familyNotificationChoices.service.js';
import { configuredReminderNumberId } from './sharedCareNumber.service.js';
import { getSmsSender, prepareSmsDelivery, resolveRegisteredSmsSender } from './smsCompliance.service.js';
import { smsTransport } from './notifyre.service.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const contactEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value)) ? normalizeEmail(value) : '';

async function chartContacts(clientId, agencyId) {
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client || Number(client.agency_id) !== Number(agencyId) ||
      client.is_archived || client.deleted_at || ['ARCHIVED','TERMINATED','DISCHARGED'].includes(String(client.status).toUpperCase())) return [];
  const [relationships] = await directory.execute(
    `SELECT cg.relationship_type, cg.access_enabled, cg.permissions_json, u.id, u.first_name, u.last_name,
      u.email,u.portal_language,COALESCE(NULLIF(u.phone_number,''),NULLIF(u.personal_phone,'')) AS phone,
      u.is_active,u.is_archived,u.status,u.role,u.terminated_at,u.status_expires_at,
      EXISTS (SELECT 1 FROM user_activity_log l WHERE l.user_id=u.id AND l.action_type='login') AS has_signed_in
     FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=?`,[client.id]);
  const contacts = relationships.filter(row=>{
    const permissions=typeof row.permissions_json==='string'?JSON.parse(row.permissions_json):row.permissions_json||{};
    return Number(row.access_enabled)===1&&Number(row.is_active)===1&&!Number(row.is_archived)&&!row.terminated_at&&
      (!row.status_expires_at||new Date(row.status_expires_at)>new Date())&&['ACTIVE','PENDING','PENDING_SETUP'].includes(String(row.status).toUpperCase())&&
      ['client','client_guardian','guardian'].includes(row.role)&&!permissions.noView&&!permissions.noContact&&
      !permissions.pendingGuardianVerification&&!permissions.coGuardianInviteRestricted&&!permissions.relationshipRevoked;
  }).map(row => ({
    key: 'user:' + row.id,
    userId: Number(row.id),
    kind: row.relationship_type === 'self' ? 'client' : 'guardian',
    name: [row.first_name,row.last_name].filter(Boolean).join(' '),
    email: contactEmail(row.email),locale:row.portal_language==='es'?'es':'en',
    phone: normalizeSmsPhone(row.phone),
    portal: Number(client.guardian_portal_enabled)===1 ? (row.has_signed_in?'active':'setup') : null,
    canSign: (typeof row.permissions_json==='string'?JSON.parse(row.permissions_json):row.permissions_json)?.canSignDocs!==false
  }));
  // An unlinked adult can receive a document at their own recorded contact.
  // An existing or past relationship must go through its regular access rules.
  if (!relationships.length && !client.user_id && ageOn(client.date_of_birth) >= 18 && ['clinical','mental_health'].includes(String(client.client_type).toLowerCase())) {
    contacts.push({ key:'client:'+client.id,userId:null,kind:'client',name:client.full_name,
      email:contactEmail(client.email),phone:normalizeSmsPhone(client.contact_phone),portal:null });
  }
  return contacts;
}

export async function eligibleDocumentRecipients(item) {
  const contacts = await chartContacts(item.client_id, item.agency_id);
  const eligible = [];
  for (const contact of contacts) {
    try {
      if (contact.userId) {
        await recipientAccess(item, contact.userId, contact.kind);
        if(item.action!=='view'&&!contact.canSign)continue;
        if (item.source_kind === 'treatment_plan' && contact.kind === 'guardian') {
          await requireGuardianPlanAccess({ agencyId:item.agency_id,clientId:item.client_id,userId:contact.userId,scope:'approve_goals',action:'sign' });
        }
      }
      if (item.respondent && contact.kind !== item.respondent) continue;
      eligible.push(contact);
    } catch (error) {
      if (error.status !== 403) throw error;
    }
  }
  return eligible;
}

export async function currentDocumentRecipient(item, key) {
  const eligible=await eligibleDocumentRecipients(item);
  const contact=eligible.find(candidate=>candidate.key===key)||
    (key==='client:'+item.client_id ? eligible.find(candidate=>candidate.kind==='client'&&candidate.userId) : null);
  if (!contact) fail(403, 'This recipient’s document access has changed.');
  return contact;
}

export async function documentTextDelivery({agencyId, clientId, recipient, body}) {
  const numberId=await configuredReminderNumberId(agencyId);
  if(!numberId)return null;
  const from = await resolveRegisteredSmsSender({agencyId,purpose:'reminders',numberId});
  if (!from || !recipient.phone) return null;
  const sender = await getSmsSender(from);
  if (sender.registration?.provider !== 'notifyre') return null;
  const delivery = await prepareSmsDelivery({to:recipient.phone,from,body,purpose:'reminders',agencyId,clientId,
    recipientUserId:recipient.userId,notificationCategory:'documents',reminderFooter:null});
  return smsTransport(delivery) === 'notifyre' ? delivery : null;
}

export async function documentDeliveryOptions(item,recipient) {
  const email = recipient.email && (await documentEmailPolicy({agencyId:item.agency_id,clientId:item.client_id,recipient})).allowed && (await familyNotificationDeliveryGate({agencyId:item.agency_id,clientId:item.client_id,
    to:recipient.email,channel:'email',notificationCategory:'documents'})).allowed;
  let sms = false;
  if (recipient.phone) {
    try {
      sms = Boolean(await documentTextDelivery({agencyId:item.agency_id,clientId:item.client_id,recipient,body:'AuricWell: Open a secure request.'}));
    } catch (error) {
      if (!error.code?.startsWith('sms_') && !error.code?.startsWith('notifyre_') && !error.status) throw error;
    }
  }
  return {email:Boolean(email),sms,portal:Boolean(recipient.portal && (recipient.portal==='active'||email))};
}
