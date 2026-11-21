import pool from '../config/database.js';
import UserCommunication from '../models/UserCommunication.model.js';
import { appointmentFamilyRecipients } from './appointmentFamilyRecipients.service.js';
import { authorizedAppointmentClient } from './guardianAppointments.service.js';
import { clientEmailContext, sendClientPortalEmail } from './clientPortalEmail.service.js';
import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

export async function notifyTutoringSummary(ctx, publication, overrides = {}) {
 const d = { db: pool, recipients: appointmentFamilyRecipients, authorize: authorizedAppointmentClient,
  context: clientEmailContext, send: sendClientPortalEmail, communications: UserCommunication, ...overrides };
 const { appointment, clientId } = ctx;
 const family = await d.recipients(clientId, appointment.agencyId);
 const context = await d.context({ agencyId: appointment.agencyId, clientId, learning: true });
 const results = [];
 for (const recipient of family.recipients) {
  if (!recipient.email) continue;
  try {
   const client = await d.authorize(recipient.userId, clientId, {
    agencyId: appointment.agencyId, serviceId: appointment.learningContext?.serviceEnrollmentId
   });
   const permissions = typeof client.permissions_json === 'string' ? JSON.parse(client.permissions_json) : client.permissions_json || {};
   if (permissions.canViewProgress === false || permissions.billingOnly || permissions.noView || permissions.noViewOtherGuardian || client.portal_access?.limited) continue;
  } catch (error) { if ([403,404].includes(error.status)) continue; throw error; }
  const db = await d.db.getConnection();
  const key = `tutoring_summary:${publication.id}:${recipient.userId}`;
  let locked = false;
  try {
   const [[lock]] = await db.execute('SELECT GET_LOCK(?,10) AS acquired', [key]);
   locked = Number(lock?.acquired) === 1;
   if (!locked) throw new Error('The summary notice is already being processed.');
   const [[previous]] = await db.execute(`SELECT id,delivery_status FROM user_communications
    WHERE agency_id=? AND user_id=? AND template_type='tutoring_summary_shared'
      AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.publicationId'))=? LIMIT 1`,
    [appointment.agencyId, recipient.userId, String(publication.id)]);
   // Pending or uncertain transports need review before another send.
   if (previous) { results.push({ id: previous.id, status: previous.delivery_status }); continue; }
   const params = new URLSearchParams({clientId:String(clientId),agencyId:String(appointment.agencyId)});
   if (appointment.learningContext?.serviceEnrollmentId) params.set('serviceId',String(appointment.learningContext.serviceEnrollmentId));
   const url = buildPublicAppUrl(context.tenant, `tutoring/appointment/${appointment.id}?${params}`);
   const subject = 'Your tutoring session summary is ready';
   const text = `Your tutor shared a session summary. Sign in to read it securely.\n\n${url}`;
   const communication = await d.communications.create({
    agencyId: appointment.agencyId, clientId, userId: recipient.userId, templateType:'tutoring_summary_shared',
    channel:'email', recipientAddress:recipient.email, subject, body:text, deliveryStatus:'pending',
    generatedByUserId:ctx.req.user.id, metadata:{publicationId:publication.id,appointmentId:appointment.id}
   });
   try {
    const sent = await d.send({ agencyId:appointment.agencyId,clientId,context,to:recipient.email,subject,text,
     title:'Session summary',ctaText:'Read session summary',ctaUrl:url,
     existingCommunicationId:communication.id,templateType:'tutoring_summary_shared',generatedByUserId:ctx.req.user.id });
    const receipt = notificationTransportReceipt(sent, appointment.agencyId);
    const status = receipt.accepted ? 'sent' : sent?.pendingApproval || sent?.queued ? 'pending' : sent?.skipped || sent?.blocked ? 'skipped' : 'flagged';
    await d.communications.updateDeliveryStatus(communication.id,status,receipt.externalId,null,
     receipt.accepted ? null : 'Summary notice requires delivery review.');
    results.push({id:communication.id,status});
   } catch {
    await d.communications.updateDeliveryStatus(communication.id,'flagged',null,null,'Delivery outcome needs review before retry.');
    results.push({id:communication.id,status:'flagged'});
   }
  } finally { if (locked) await db.execute('SELECT RELEASE_LOCK(?)',[key]); db.release(); }
 }
 return results;
}
