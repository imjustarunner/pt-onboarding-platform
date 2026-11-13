import pool from '../config/database.js';
import { renderPortalEmail } from './portalEmailBranding.service.js';
import { resolveWaitlistMailboxes } from './providerWaitlistEmail.service.js';
import { sendNotificationEmail, sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { clientEmailContext, sendClientPortalEmail } from './clientPortalEmail.service.js';
import { resolveDayCancellationEmail, reviewedDayCancellationContext } from './dayCancellationEmail.service.js';
import { individualCancellationEmailContext } from './appointmentCancellationEmail.service.js';
import { serviceNotificationBlocked } from './clientServiceNotificationPolicy.service.js';

async function scheduleMailboxes(agencyId) {
  try { return await resolveWaitlistMailboxes(pool, agencyId); }
  catch (error) {
    if (error?.code !== 'WAITLIST_MAILBOX_NOT_CONFIGURED') throw error;
    throw Object.assign(new Error('Configure this agency’s notifications sender and support Reply-To before sending appointment updates.'), { code: 'SCHEDULE_MAILBOX_NOT_CONFIGURED' });
  }
}

/** Require the tenant's configured notifications sender and staffed support reply mailbox. */
export async function sendScheduleNotificationEmail({ agencyId, appointment = null, entries = null, ...message }) {
  if(message.clientId) {
    const items=entries || (appointment ? [{appointment}] : []);
    if((await Promise.all(items.map(item=>serviceNotificationBlocked({appointment:item.appointment,clientId:message.clientId,facts:item.payload?.facts})))).some(Boolean))return {skipped:true,reason:'service_ended_notifications_disabled'};
    const learning=items.length>0 && items.every(item=>['learning','tutoring'].includes(String(item.appointment?.businessType||item.appointment?.business_type||'').toLowerCase()));
    const context=await clientEmailContext({agencyId,clientId:message.clientId,...(learning?{learning:true}: {})});
    const reviewed=items.filter(item=>item.payload?.facts?.reviewedCancellationToken);
    if(reviewed.length) {
      if(reviewed.length!==items.length) throw new Error('Review the mixed schedule notices separately before sending this cancellation.');
      const facts=reviewed[0].payload.facts;
      const input={...message,agencyId,templateType:'day_cancellation',
        reviewedCancellationToken:facts.reviewedCancellationToken,reviewedCancellationItemKey:facts.reviewedCancellationItemKey};
      const proof=await reviewedDayCancellationContext(input);
      const envelope=await resolveDayCancellationEmail({agencyId,providerId:proof.providerId,
        providerAuthored:proof.plan.facts.providerAuthored,actorUserId:proof.actorUserId,
        reviewedCancellationToken:proof.reviewedCancellationToken,reviewedCancellationItemKey:proof.reviewedCancellationItemKey});
      return sendEmailFromIdentity({...input,...envelope,html:renderPortalEmail({brand:envelope.portalEmailBrand,...message})});
    }
    if(items.length && items.every(item=>item.payload?.individualCancellationReview)) {
      const input={...message,agencyId,templateType:'session_cancellation'};
      const proof=await individualCancellationEmailContext(input);
      if(!proof)throw new Error('The signed cancellation email is missing its persisted recipient review.');
      const envelope=await resolveDayCancellationEmail({agencyId,providerId:proof.providerId,
        providerAuthored:proof.plan.facts.providerAuthored,actorUserId:proof.actorUserId});
      return sendEmailFromIdentity({...input,...envelope,html:renderPortalEmail({brand:envelope.portalEmailBrand,...message})});
    }
    // These are booking/cancellation updates. The morning reminder preference is
    // checked by the reminder senders, while these retain schedule_changes and
    // global/confidential contact choices in the shared delivery gates.
    message.templateType ||= 'session_change';
    if (items.some(item => item.payload?.facts?.reasonCategory)) {
      const mailboxes = await scheduleMailboxes(agencyId);
      const brand = { ...context.brand, replyTo: mailboxes.support, displayName: `${context.tenant.name} Notifications` };
      return sendEmailFromIdentity({ ...message, agencyId, senderIdentityId: mailboxes.senderIdentityId,
        replyToOverride: mailboxes.support, fromDisplayNameOverride: brand.displayName, portalEmailBrand: brand,
        html: renderPortalEmail({ brand, ...message }) });
    }
    return sendClientPortalEmail({...message,agencyId,context});
  }
  const mailboxes = await scheduleMailboxes(agencyId);
  const send = message.existingCommunicationId ? sendEmailFromIdentity : sendNotificationEmail;
  return send({ ...message, agencyId, senderIdentityId: mailboxes.senderIdentityId,
    replyToOverride: mailboxes.support });
}
