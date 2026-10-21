import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { inferAgencyMailDomain, ensureTenantNotificationsMailbox } from './tenantMessageMailboxes.service.js';
import { ensurePortalGroupSender } from './portalGroupSender.service.js';
import { enrollmentMailBrand, renderPortalEmail } from './portalEmailBranding.service.js';
import { resolveClientPortalContext, clientPortalAppUrl } from './clientPortalContext.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

export async function clientEmailContext({ agencyId, clientId, client = null, learning, clinical } = {}) {
  client ||= clientId ? await Client.findById(clientId) : null;
  if (client && Number(client.agency_id) !== Number(agencyId)) throw new Error('Email client does not belong to this agency.');
  const context = client ? await resolveClientPortalContext(client) : { tenant:await Agency.findById(agencyId), learning:learning === true, clinical:clinical === true };
  if (!context.tenant) throw new Error('Email agency unavailable.');
  const domain = await inferAgencyMailDomain(agencyId);
  if (!domain) throw new Error('Configure the agency support email domain.');
  // Explicit context is used for product-native EHR records and reviewed previews.
  const isLearning = learning ?? context.learning;
  const isClinical = !isLearning && (clinical ?? (client?.client_type ? context.clinical : enrollmentMailBrand({agency:context.tenant,domain}).clinical));
  const portal = context.portal || {...context.tenant, clinical_portal:isClinical};
  const brand = enrollmentMailBrand({agency:context.tenant,domain,school:client?.client_type === 'school',clinicalOverride:isClinical});
  return {...context,client,portal:{...portal,clinical_portal:isClinical},learning:!!isLearning,clinical:!!isClinical,brand,domain,
    url:path=>clientPortalAppUrl({...portal,clinical_portal:isClinical},path)};
}

export async function clientPortalSender(context, { billing = false } = {}) {
  const agencyId = context.tenant.id;
  if (billing) {
    const {requireReadySender} = await import('./familyLedger/senders.js');
    return requireReadySender(agencyId,'billing');
  }
  if (!context.clinical) return (await ensureTenantNotificationsMailbox(agencyId)).notifications;
  const key = 'clinical_enrollment_portal';
  let identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId,key);
  await ensurePortalGroupSender({address:'portal@auricwell.com',displayName:'AuricWell Portal'});
  if (!identity) identity = await EmailSenderIdentity.create({agencyId,identityKey:key,displayName:'AuricWell Portal',fromEmail:'portal@auricwell.com',replyTo:context.brand.replyTo,isActive:true,inboundAddresses:[]});
  if (!identity.is_active || identity.from_email !== 'portal@auricwell.com') throw new Error('Configure the active AuricWell portal sender.');
  return identity;
}

/** Shared standard delivery for clinical and learning family correspondence. */
export async function sendClientPortalEmail({ agencyId, clientId = null, context = null, billing = false, ...message }) {
  context ||= await clientEmailContext({agencyId,clientId});
  const identity = await clientPortalSender(context,{billing});
  const brand = {...context.brand,replyTo:billing ? identity.from_email : context.brand.replyTo,
    displayName:billing ? `${context.tenant.name} Billing` : context.clinical ? 'AuricWell Portal' : `${context.tenant.name} Notifications`};
  return sendEmailFromIdentity({...message,clientId,agencyId,senderIdentityId:identity.id,
    replyToOverride:brand.replyTo,fromDisplayNameOverride:brand.displayName,portalEmailBrand:brand,
    html:renderPortalEmail({brand,...message}),usedFallbackSender:false});
}
