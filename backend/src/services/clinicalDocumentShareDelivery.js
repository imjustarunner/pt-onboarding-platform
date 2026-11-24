import {documentEmailPolicy,qaDocumentFormsMailbox} from './clinicalDocumentShareQa.js';
import {notificationTransportReceipt} from '../utils/notificationTransportReceipt.js';
import {QA_EMAIL_INBOX} from '../utils/qaEmailPolicy.js';
import { clientEmailContext } from './clientPortalEmail.service.js';
import { clientPortalInviteUrl } from './clientPortalContext.service.js';
import { documentTextDelivery } from './clinicalDocumentShareRecipients.js';
import { sendNotifyreSms } from './notifyre.service.js';
import { ensureTenantFormsMailbox } from './tenantMessageMailboxes.service.js';
import { clinicalEmailPortalLink } from './clinicalPortalSetupEmail.service.js';
import { escapePortalHtml, portalMessageHtml, renderPortalEmail } from './portalEmailBranding.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

// The credential is placed in a fragment to keep it out of HTTP access logs.
export const documentRequestUrl = token => {
  const url = new URL('/sign/documents', 'https://app.itsco.health');
  url.hash = token;
  return url.toString();
};

export async function sendDocumentDelivery({agencyId,clientId,recipient,channel,token,actorId,deliveryId}) {
  const context = await clientEmailContext({agencyId,clientId});
  const direct = channel !== 'portal';
  const locale=recipient.locale||'en';
  const spanish=locale==='es';
  if (channel === 'sms') {
    const introduction=spanish?'AuricWell: Abra una solicitud segura de su equipo de atención. ':'AuricWell: Open a secure request from your care team. ';
    const body=introduction+documentRequestUrl(token);
    const delivery = await documentTextDelivery({agencyId,clientId,recipient,body});
    if (!delivery) return {state:'failed'};
    const result = await sendNotifyreSms(delivery);
    return {state:'queued',reference:result.sid};
  }
  if (!recipient.email) return {state:direct?'failed':'sent'};
  const policy=await documentEmailPolicy({agencyId,clientId,recipient});
  if(!policy.allowed)return {state:'failed'};
  const login = clientPortalInviteUrl({portal:context.portal,existingAccount:true});
  const setup = (await clinicalEmailPortalLink({context,to:recipient.email}))?.url
    || login;
  const setupLabel = spanish ? 'Cree su cuenta' : 'Create your account';
  const linkUrl = direct ? documentRequestUrl(token) : recipient.portal==='setup' ? setup : login;
  const linkLabel = direct ? (spanish ? 'Abrir solicitud segura' : 'Open secure request') :
    recipient.portal==='setup' ? setupLabel : (spanish ? 'Abrir su portal' : 'Open your portal');
  const subject = spanish ? 'Un mensaje de su equipo de atención' : 'A message from your care team';
  const introduction = spanish
    ? 'Su equipo de atención ha compartido algo con usted en AuricWell.'
    : 'Your care team has shared something with you in AuricWell.';
  const text = introduction + '\n\n' + linkUrl + '\n\n' + setupLabel + ': ' + setup;
  const html = portalMessageHtml({text:introduction+'\n\n'+linkUrl,linkUrl,linkLabel}) +
    '<p><a href="'+escapePortalHtml(setup)+'">'+setupLabel+'</a></p>';
  const {forms,domain} = await (policy.testInbox?qaDocumentFormsMailbox(agencyId):ensureTenantFormsMailbox(agencyId));
  const brand = {...context.brand,clinical:true,displayName:'AuricWell Forms',replyTo:policy.testInbox?QA_EMAIL_INBOX:'support@'+domain};
  const result = await sendEmailFromIdentity({agencyId,clientId,to:recipient.email,userId:recipient.userId,
    senderIdentityId:forms.id,fromDisplayNameOverride:'AuricWell Forms',replyToOverride:brand.replyTo,
    subject,text,html:renderPortalEmail({brand,html,locale}),privateDocumentDeliveryId:deliveryId,qaDocumentRedirect:policy.testInbox,templateType:'clinical_portal_documents',
    generatedByUserId:actorId,source:'auto',usedFallbackSender:false});
  if (result?.pendingApproval || result?.queued) return {state:'queued',reference:result.messageId};
  const receipt=notificationTransportReceipt(result,agencyId);
  if(receipt.accepted&&(!policy.testInbox||receipt.redirectedTo===QA_EMAIL_INBOX))return {state:'sent',reference:receipt.externalId};
  return {state:'failed'};
}
