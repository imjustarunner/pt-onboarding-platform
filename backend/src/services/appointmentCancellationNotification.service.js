import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import UserCommunication from '../models/UserCommunication.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import VonageService from './vonage.service.js';
import { resolveRegisteredSmsSender } from './smsCompliance.service.js';
import { loadClientConsent, getClientPreferences, getTenantSettings } from './sessionNotification.service.js';
import { sendScheduleNotificationEmail } from './scheduleNotificationEmail.service.js';
import { logCommunication } from './appointmentReminder.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { cancellationFollowUp, validateCancellationChoices, appointmentTimeLabel } from './cancellationFollowUp.service.js';

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
const fail = message => Object.assign(new Error(message), { status: 400 });
const CANCELED_STATUSES = new Set(['canceled', 'cancelled', 'canceled_by_provider', 'canceled_by_client',
  'canceled_by_guardian', 'canceled_by_organization', 'canceled_by_agency', 'late_canceled', 'rescheduled']);
export const isCanceledAppointmentStatus = status => CANCELED_STATUSES.has(String(status || '').toLowerCase());
export const CANCELLATION_FOLLOW_UP = Object.freeze({
  support_will_contact: 'Our support team will contact you to arrange another appointment.',
  client_contact_support: 'Please contact our support team to arrange another appointment.',
  replacement_booked: 'A replacement appointment has been scheduled. Please review its separate confirmation.',
  keep_next: 'Your next scheduled appointment remains in place.',
  keep_next_or_support: 'Your next scheduled appointment remains in place.',
  private_slots: 'Your provider has offered you replacement times in your client portal.',
  portal_booking: 'You can choose an available replacement time in your client portal.',
  none: 'No action is required. Other scheduled appointments remain unchanged.'
});

export function cancellationClientDetails(facts = {}, { requireReason = true } = {}) {
  const choices = validateCancellationChoices(facts);
  const reason = String(facts.clientFacingReason || '').trim();
  if ((requireReason && !reason) || reason.length > 500) throw fail('Enter the cancellation reason to share with the client (up to 500 characters).');
  const followUpAction = facts.followUpAction || 'keep_next';
  if (!Object.hasOwn(CANCELLATION_FOLLOW_UP, followUpAction)) throw fail('Choose a follow-up action for the client.');
  if (followUpAction === 'replacement_booked' && !Number(facts.replacementAppointmentId)) throw fail('Link the replacement appointment before telling the client it is booked.');
  const followUpMessage = String(facts.followUpMessage || '').trim();
  if (followUpMessage.length > 1000) throw fail('Keep the client follow-up message within 1,000 characters.');
  return { clientFacingReason: reason, followUpAction, followUpMessage, notificationMode: choices.notificationMode };
}

export function buildCancellationNotification(appointment, facts, resolved = {}) {
  const details = cancellationClientDetails(facts);
  const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short',
    timeZone: appointment.sourceTimezone || 'America/Denver' }).format(parseUtcDate(appointment.startAt));
  const nextText = resolved.nextAppointment
    ? `Your next ${resolved.nextAppointment.recurring ? 'recurring ' : ''}appointment is ${resolved.nextAppointment.displayWhen} (${resolved.nextAppointment.timeZone}). It remains scheduled; you do not need to book it again.`
    : 'No next appointment is currently scheduled.';
  let followUpText = CANCELLATION_FOLLOW_UP[details.followUpAction];
  if (['keep_next', 'keep_next_or_support'].includes(details.followUpAction)) followUpText = nextText;
  if (['private_slots', 'portal_booking'].includes(details.followUpAction)) followUpText = resolved.offer?.status === 'open'
    ? `${followUpText} Open Appointments in your signed-in client portal by ${appointmentTimeLabel(resolved.offer.expires_at, appointment.sourceTimezone)} (${appointment.sourceTimezone || 'America/Denver'}). These times are reserved for invited clients and may be offered to more than one person. The first completed reservation schedules your replacement appointment immediately. Your provider will reach out if there are any changes to their schedule. The link shows only times still available. ${nextText} This offer does not change your recurring schedule.`
    : `No replacement times are currently being offered. ${nextText}`;
  const moved = facts.eventType === 'rescheduled' && resolved.replacement;
  const paragraphs = [
    moved ? `Your appointment has moved from ${when} (${appointment.sourceTimezone || 'America/Denver'}) to ${appointmentTimeLabel(resolved.replacement.startAt, resolved.replacement.sourceTimezone || appointment.sourceTimezone)} (${resolved.replacement.sourceTimezone || appointment.sourceTimezone || 'America/Denver'}). The previous time is no longer scheduled.` : `Your appointment${appointment.providerName ? ` with ${appointment.providerName}` : ''} scheduled for ${when} (${appointment.sourceTimezone || 'America/Denver'}) has been canceled.`,
    `Reason: ${details.clientFacingReason}`,
    moved ? 'Please sign in to see your updated appointment and any other schedule changes.'
      : `${followUpText}${['keep_next', 'keep_next_or_support', 'private_slots', 'portal_booking'].includes(details.followUpAction) ? '' : ` ${nextText}`} Please sign in to see any updates to your appointments.`,
    ...(details.followUpMessage ? [details.followUpMessage] : []),
    'If you have questions, you can contact your care team. Please use a secure conversation for clinical details.'
  ];
  const portalUrl = resolved.portalUrl;
  const links = portalUrl ? `<p><a href="${escapeHtml(portalUrl)}">${resolved.offer?.status === 'open' ? 'View available reschedule options' : 'Review my appointments'}</a></p>${resolved.offer?.status === 'open' && resolved.nextAppointment ? `<p><a href="${escapeHtml(portalUrl + '&offerAction=keep_next')}">See you next session — ${escapeHtml(resolved.nextAppointment.displayWhen)}</a></p><p>Confirm this choice in your portal to decline the replacement offer and keep your next session.</p>` : ''}` : '';
  const reviewed = facts.reviewedMessage;
  if (reviewed) {
    paragraphs.splice(0, paragraphs.length, reviewed.text);
    paragraphs.push(followUpText);
    if (!['keep_next','keep_next_or_support','private_slots','portal_booking'].includes(details.followUpAction)) paragraphs.push(nextText);
  }
  const text = [...paragraphs, ...(portalUrl ? [`Review the latest options: ${portalUrl}`] : [])].join('\n\n');
  return { ...details, when, followUpText, replacementAppointmentId: moved ? resolved.replacement.id : null, subject: reviewed?.subject || (moved ? 'Your appointment has moved' : 'Your appointment has been canceled'), text,
    html: paragraphs.map(p => `<p>${escapeHtml(p).replaceAll('\n', '<br>')}</p>`).join('') + links,
    sms: `Your appointment schedule has been updated. Please review the latest details in your secure portal${portalUrl ? `: ${portalUrl}` : '.'}` };
}

/** A durable claim is written before transport. Uncertain delivery stays visible
 * for staff review; background retries never duplicate a potentially delivered notice. */
export function createCancellationNotificationService({ database = pool, appointments = Appointment,
  communications = UserCommunication, consent = loadClientConsent, preferences = getClientPreferences,
  tenantSettings = getTenantSettings, sendEmail = sendScheduleNotificationEmail,
  smsSender = resolveRegisteredSmsSender, sendSms = options => VonageService.sendSms(options),
  log = logCommunication, encrypt = maybeEncryptNotePayload, decrypt = maybeDecryptNotePayload,
  provider = async id => (await import('../models/User.model.js')).default.findById(id),
  followUp = cancellationFollowUp, offers = { ensure: async (...args) => (await import('./appointmentReplacementOffer.service.js')).replacementOffers.ensure(...args) } } = {}) {
  async function summary(appointmentId) {
    const [rows] = await database.execute('SELECT id,client_id,channel,delivery_status,error_message FROM appointment_cancellation_deliveries WHERE appointment_id=? ORDER BY id', [appointmentId]);
    const count = state => rows.filter(row => row.delivery_status === state).length;
    return { sent: count('sent'), failed: count('failed'), held: count('review') + count('held') + count('sending'),
      suppressed: count('suppressed'), skipped: count('skipped'), pending: count('pending'), deliveries: rows.map(row => ({ id: row.id, clientId: row.client_id,
        channel: row.channel, status: row.delivery_status, reason: row.error_message || null })) };
  }

  async function process(id) {
    const [claimed] = await database.execute("UPDATE appointment_cancellation_deliveries SET delivery_status='sending' WHERE id=? AND delivery_status='pending'", [id]);
    if (claimed.affectedRows !== 1) return;
    const [[row]] = await database.execute('SELECT * FROM appointment_cancellation_deliveries WHERE id=?', [id]);
    let message = { text: 'Cancellation notification could not be prepared.' };
    let audit = null, recipient = null, attempted = false, acceptedExternalId = null;
    async function finish(status, error = null, externalId = null) {
      await database.execute('UPDATE appointment_cancellation_deliveries SET delivery_status=?,error_message=?,external_message_id=?,recipient_address=?,communication_id=? WHERE id=?',
        [status, error, externalId, recipient, audit?.id || null, id]);
      if (audit?.id) await communications.updateDeliveryStatus(audit.id, status === 'suppressed' ? 'skipped' : status === 'review' || status === 'held' ? 'failed' : status,
        externalId, null, error);
      await log({ appointmentId: row.appointment_id, agencyId: row.agency_id, kind: 'cancellation', channel: row.channel,
        bodyPreview: message.text, createdByUserId: row.created_by_user_id,
        metadata: { cancellationDeliveryId: id, clientId: row.client_id, deliveryStatus: status,
          reason: error, recipient, communicationId: audit?.id || null, body: row.channel === 'sms' ? message.sms : message.text,
          clientFacingReason: message.clientFacingReason, followUpAction: message.followUpAction, followUpMessage: message.followUpMessage } });
    }
    try {
      message = decode(decrypt(typeof row.notification_json === 'string' ? row.notification_json : JSON.stringify(row.notification_json)));
      const appointment = await appointments.findById(row.appointment_id);
      const participants = appointment ? await appointments.listParticipants(row.appointment_id) : [];
      if (!appointment || Number(appointment.agencyId) !== Number(row.agency_id)
          || !participants.some(p => Number(p.clientId) === Number(row.client_id)) || !isCanceledAppointmentStatus(appointment.status)) {
        await finish('skipped', 'Appointment is no longer canceled or recipient is no longer linked.'); return;
      }
      if (message.notificationMode === 'none') {
        audit = await communications.create({ agencyId: row.agency_id, clientId: row.client_id,
          templateType: 'session_cancellation', channel: 'in_app', subject: 'Cancellation recorded without notification',
          body: 'The cancellation was recorded. The provider chose not to send an email or text.',
          generatedByUserId: row.created_by_user_id, deliveryStatus: 'skipped', metadata: { appointmentId: row.appointment_id, cancellationDeliveryId: id } });
        await finish('suppressed', 'Provider chose no notification. See the signed cancellation record.'); return;
      }
      const contact = await consent(row.client_id, row.agency_id);
      const prefs = await preferences(row.agency_id, row.client_id, contact.guardianUserId);
      recipient = row.channel === 'sms' ? PhoneNumber.normalizePhone(contact.phoneNumber) : contact.emailAddress;
      audit = await communications.create({ agencyId: row.agency_id, clientId: row.client_id,
        userId: contact.guardianUserId || null, templateType: 'session_cancellation', channel: row.channel,
        subject: message.subject, body: row.channel === 'sms' ? message.sms : message.text, recipientAddress: recipient,
        generatedByUserId: row.created_by_user_id, metadata: { appointmentId: row.appointment_id, cancellationDeliveryId: id }, deliveryStatus: 'pending' });
      if (!recipient || !contact[row.channel] || prefs.schedulingChangesEnabled === false || (!prefs.isDefault && prefs.channels?.[row.channel] === false)) {
        await finish('skipped', 'No permitted contact channel; scheduling staff must follow up.'); return;
      }
      let result;
      if (row.channel === 'email') {
        attempted = true;
        result = await sendEmail({ agencyId: row.agency_id, clientId: row.client_id, userId: contact.guardianUserId || null,
          appointment,
          to: recipient, subject: message.subject, text: message.text, html: message.html, triggerKey: 'session_cancellation',
          templateType: 'session_cancellation', generatedByUserId: row.created_by_user_id, source: 'auto', existingCommunicationId: audit.id });
      } else {
        const from = await smsSender({ agencyId: row.agency_id, purpose: 'reminders' });
        if (!from) { await finish('held', 'No registered SMS reminder sender; scheduling staff must follow up.'); return; }
        attempted = true;
        result = await sendSms({ agencyId: row.agency_id, clientId: row.client_id, notificationCategory:'schedule_changes', purpose: 'reminders', from, to: recipient, body: message.sms });
      }
      const externalId = result?.id || result?.sid || result?.messageId || result?.messageUuid || result?.messageUUID || null;
      acceptedExternalId = externalId;
      if(result?.reason==='school_session_email_opted_out') {await finish('skipped',result.reason);return;}
      const sent = externalId && !result?.skipped && !result?.blocked && !result?.redirected && !result?.pendingApproval && !result?.queued;
      await finish(sent ? 'sent' : 'held', sent ? null : result?.reason || 'Delivery held; review the client communications record before resending.', externalId);
    } catch (error) {
      await finish(attempted ? 'review' : 'failed', String(error?.message || 'Cancellation notification failed').slice(0, 500), acceptedExternalId);
    }
  }

  async function notify(appointmentId, facts, actorUserId = null) {
    if (!['canceled', 'rescheduled'].includes(facts.eventType)) return null;
    const appointment = await appointments.findById(appointmentId);
    const clinician = appointment.providerUserId ? await provider(appointment.providerUserId).catch(() => null) : null;
    const providerName = [clinician?.preferred_name || clinician?.first_name, clinician?.last_name].filter(Boolean).join(' ');
    cancellationClientDetails(facts);
    const participants = await appointments.listParticipants(appointmentId);
    const tenant = await tenantSettings(appointment.agencyId);
    // Email is the standard cancellation notice. SMS is additional and must be
    // enabled by the organization as well as allowed by the recipient at send time.
    const channels = facts.notificationMode === 'none' ? ['email'] : ['email', ...(tenant?.channelsEnabled?.sms === true && tenant?.changeNotify?.channels?.includes('sms') ? ['sms'] : [])];
    for (const clientId of new Set(participants.map(p => Number(p.clientId)).filter(Boolean))) {
      const resolved = {};
      if (facts.eventType === 'canceled') {
        resolved.nextAppointment = await followUp.nextAppointment(appointment, clientId, { afterAt: facts.followUpAfterAt || null, excludeAppointmentIds: facts.followUpExcludedAppointmentIds || [] });
      }
      if (['private_slots', 'portal_booking'].includes(facts.followUpAction)) {
        try { resolved.offer = await offers.ensure(appointment, clientId, facts, actorUserId); }
        catch (e) { if (![400, 409].includes(e.status)) throw e; }
      }
      const message = buildCancellationNotification({ ...appointment, providerName }, facts, resolved);
      for (const channel of channels) await database.execute(`INSERT IGNORE INTO appointment_cancellation_deliveries
        (appointment_id,agency_id,client_id,channel,notification_json,created_by_user_id) VALUES (?,?,?,?,?,?)`,
      [appointmentId, appointment.agencyId, clientId, channel, encrypt(JSON.stringify(message)), actorUserId]);
    }
    const [pending] = await database.execute("SELECT id FROM appointment_cancellation_deliveries WHERE appointment_id=? AND delivery_status='pending'", [appointmentId]);
    for (const row of pending) await process(row.id);
    return summary(appointmentId);
  }
  async function processDue({ limit = 20, agencyId = null } = {}) {
    const [rows] = await database.execute(`SELECT id FROM appointment_cancellation_deliveries WHERE delivery_status='pending' AND (? IS NULL OR agency_id=?) ORDER BY id LIMIT ${Math.max(1, Math.min(100, Number(limit) || 20))}`, [agencyId,agencyId]);
    for (const row of rows) await process(row.id);
    return { processed: rows.length };
  }
  async function retry(appointmentId, deliveryId) {
    const [updated] = await database.execute("UPDATE appointment_cancellation_deliveries SET delivery_status='pending' WHERE id=? AND appointment_id=? AND delivery_status IN ('failed','skipped')", [deliveryId, appointmentId]);
    if (updated.affectedRows !== 1) throw Object.assign(new Error('This notification was sent, is processing, or has an uncertain delivery. Check the communication record before contacting the client again.'), { status: 409 });
    await process(deliveryId);
    return summary(appointmentId);
  }
  return { notify, process, processDue, summary, retry };
}
export const notifyAppointmentCancellation = async (appointmentId, facts, actorUserId = null) => {
  if (!['canceled', 'rescheduled'].includes(facts.eventType)) return null;
  return (await import('./appointmentScheduleNotice.service.js')).appointmentScheduleNotices.queue(appointmentId, { eventType: facts.eventType, facts, actorUserId });
};
export const processDueCancellationNotifications = (...args) => createCancellationNotificationService().processDue(...args);
export const retryCancellationNotification = (...args) => createCancellationNotificationService().retry(...args);
