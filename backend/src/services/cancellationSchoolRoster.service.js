import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { cancellationRecipients, reviewedMessage } from './cancellationRecipients.service.js';
import { createCancellationSchoolNoticeService } from './cancellationSchoolNotice.service.js';
import { hasTerminalClientStatus } from './clientTerminationRoster.service.js';
import { dayAbsenceMessage, schoolAbsenceWhen } from './dayAbsencePolicy.service.js';
import { schoolAbsenceHistory } from './schoolAbsenceHistory.service.js';
import { cancellationEmailReceipts, needsCancellationReceipt, appendCancellationReceipt } from './cancellationEmailReceipt.service.js';
import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';

const fail = message => Object.assign(new Error(message), { status: 409 });

async function textOptedInGuardian(d, item, recipient, actorUserId) {
  if (item.absenceSource && item.absenceSource !== 'cancel_day') return;
  const allowed = await d.permitted(item.clientId, item.agencyId, recipient, 'sms', { actorUserId, reviewedCancellationToken: item.reviewedCancellationToken, reviewedCancellationItemKey: item.reviewedCancellationItemKey });
  if (!allowed || !recipient.phone) return;
  const { parentCancellationSms } = await import('./dayAbsenceNarrative.service.js');
  const phone = (await import('../models/PhoneNumber.model.js')).default.normalizePhone(recipient.phone);
  const from = await (await import('./smsCompliance.service.js')).resolveRegisteredSmsSender({ agencyId: item.agencyId, purpose: 'reminders' });
  if (!phone || !from) return;
  let portal = 'your client portal';
  try {
    const context = await (await import('./clientPortalEmail.service.js')).clientEmailContext({ agencyId: item.agencyId, clientId: item.clientId });
    portal = context.url(`guardian?panel=appointments&clientId=${encodeURIComponent(item.clientId)}`);
  } catch { /* The short text still tells the parent where to look. */ }
  await (await import('./vonage.service.js')).default.sendSms({ agencyId: item.agencyId, clientId: item.clientId, notificationCategory: 'schedule_changes', purpose: 'reminders', from, to: phone, body: parentCancellationSms(portal) });
}

export async function sendRosterEmail({ agencyId, clientId, ...message }) {
  const { clientEmailContext } = await import('./clientPortalEmail.service.js');
  const { resolveDayCancellationEmail } = await import('./dayCancellationEmail.service.js');
  const { renderPortalEmail } = await import('./portalEmailBranding.service.js');
  const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  const context = await clientEmailContext({ agencyId, clientId });
  const sender = await resolveDayCancellationEmail({ agencyId, providerId:message.providerId, providerAuthored:message.providerAuthored,
    actorUserId:message.generatedByUserId, reviewedCancellationToken:message.reviewedCancellationToken,
    reviewedCancellationItemKey:message.reviewedCancellationItemKey });
  const brand = { ...context.brand, ...sender.portalEmailBrand, replyTo: sender.replyToOverride, displayName: sender.fromDisplayNameOverride };
  const appointmentsUrl = context.url(`guardian?panel=appointments&clientId=${encodeURIComponent(clientId)}`);
  const text = `${message.text}\n\nReview my appointments: ${appointmentsUrl}`;
  const { escapeNoticeHtml } = await import('./scheduleNoticeMessage.service.js');
  const html = `${message.html || `<p>${escapeNoticeHtml(message.text).replaceAll('\n','<br>')}</p>`}<p><a href="${escapeNoticeHtml(appointmentsUrl)}">Review my appointments</a></p>`;
  return sendEmailFromIdentity({ ...message, ...sender, agencyId, clientId, text,
    html: renderPortalEmail({ brand, text, html }), portalEmailBrand: brand,
    templateType: 'day_cancellation' });
}

/** School-day assignments are notification evidence, never synthetic appointments. */
export function createCancellationSchoolRosterService(overrides = {}) {
  const d = { database: pool, contacts: (...args) => cancellationRecipients.review(...args),
    permitted: (...args) => cancellationRecipients.permitted(...args), sendEmail: sendRosterEmail, history: schoolAbsenceHistory, receipts:cancellationEmailReceipts, ...overrides };
  async function readRoster({ agencyId, providerId, providerIds = null, date }) {
    if (providerIds && !providerIds.length) return [];
    const weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(`${date}T12:00:00Z`).getUTCDay()];
    const [rows] = await d.database.execute(`SELECT ${providerIds ? "cpa.provider_user_id AS provider_id," : ""}cpa.id AS assignment_id,cpa.client_id,cpa.organization_id AS school_id,
      cpa.service_day,cpa.updated_at,c.status,c.full_name AS client_name,c.initials AS client_initials,s.status_key AS client_status_key,s.label AS client_status_label,
      school.name AS school_name,CONCAT_WS(' ',u.first_name,u.last_name) AS provider_name,
      ss.id AS slot_id,ss.start_time,ss.end_time,ss.note AS slot_note,ss.updated_at AS slot_updated_at
      FROM client_provider_assignments cpa
      JOIN clients c ON c.id=cpa.client_id AND c.agency_id=?
      JOIN users u ON u.id=cpa.provider_user_id
      JOIN agencies school ON school.id=cpa.organization_id
      JOIN organization_affiliations oa ON oa.organization_id=school.id AND oa.agency_id=c.agency_id AND oa.is_active=1
      JOIN provider_school_assignments psa ON psa.provider_user_id=cpa.provider_user_id
        AND psa.school_organization_id=cpa.organization_id AND BINARY psa.day_of_week=BINARY cpa.service_day AND psa.is_active=1
      LEFT JOIN client_statuses s ON s.id=c.client_status_id
      LEFT JOIN soft_schedule_slots ss ON ss.client_id=cpa.client_id AND ss.school_organization_id=cpa.organization_id
        AND ss.provider_user_id=cpa.provider_user_id AND BINARY ss.weekday=BINARY cpa.service_day
      WHERE cpa.provider_user_id ${providerIds ? `IN (${providerIds.map(()=>"?").join(",")})` : "=?"} AND cpa.service_day=? AND cpa.is_active=1
      ORDER BY cpa.client_id,cpa.organization_id,cpa.id`, [agencyId, ...(providerIds || [providerId]), weekday]);
    const clients = new Map();
    for (const row of rows.filter(r => !['ARCHIVED','INACTIVE'].includes(r.status) && !hasTerminalClientStatus(r)
      && !['waitlist','inactive'].includes(String(r.client_status_key || '').toLowerCase()))) {
      const { slot_id, start_time, end_time, slot_note, slot_updated_at, ...assignment } = row;
      const key = `${providerIds ? row.provider_id + ":" : ""}${row.client_id}:${row.school_id}`;
      if (!clients.has(key)) clients.set(key, { ...assignment, slots: [] });
      if (slot_id && !clients.get(key).slots.some(s => s.id === Number(slot_id))) clients.get(key).slots.push({ id: Number(slot_id), startTime: start_time, endTime: end_time, note: slot_note, updatedAt: slot_updated_at });
    }
    return [...clients.values()];
  }
  const list = args => readRoster(args);
  const readMany = args => readRoster({ ...args, providerIds: args.providerIds });
  async function review(row, { agencyId, providerId, date, timeZone, windowStart, windowEnd, reason, reasonCategory, providerAuthored = false, urgent = true, absenceSource = 'cancel_day', choices, message, required = false, followUpAction, followUpMessage = '' }) {
    const clientId = Number(row.client_id);
    const client = await d.contacts(clientId, agencyId, choices, { required, allowMissingEmail: true });
    // Assigned-day notices have no appointment/portal session to attach texts or replacement offers to.
    if (client.channels.some(c => c !== 'email')) throw fail('Assigned-day school notices support email. Review other contact methods separately.');
    if (followUpAction === 'private_slots') throw fail('Private replacement times require scheduled appointments. Choose contact support for assigned-day clients.');
    let reviewed;
    const letter = { urgent, providerAuthored, providerName: row.provider_name, clientName: client.clientName, schoolName: row.school_name, date, when: schoolAbsenceWhen({ date, slots: row.slots, timeZone, windowStart, windowEnd }), reason, reasonCategory, note: followUpMessage };
    try { reviewed = reviewedMessage(message, { ...dayAbsenceMessage({ ...letter, audience: 'guardian' }), client: dayAbsenceMessage({ ...letter, audience: 'client' }), guardian: dayAbsenceMessage({ ...letter, audience: 'guardian' }) }); }
    catch(error) { throw fail(`${client.clientName}: ${error.message}`); }
    return { key: `school_roster:${agencyId}:${providerId}:${date}:${clientId}:${row.school_id}`, kind: 'school_roster',
      id: clientId, clientId, agencyId, providerId, schoolId: Number(row.school_id), date,
      reason, reasonCategory, urgent, absenceSource, providerAuthored, emailOnly:true,
      title: `${client.clientName} — ${row.school_name} assigned-day notice`, clients: [{ ...client, emailOnly: true }],
      recipients: [client.clientName],
      message: reviewed,
      source: { assignment: row, contacts: client.contacts } };
  }
  async function deliver(_token, item, actorUserId, historyId) {
    const current = (await list(item)).find(r => Number(r.client_id) === item.clientId && Number(r.school_id) === item.schoolId);
    if (!current || JSON.stringify(current) !== JSON.stringify(item.source.assignment)) throw fail('This school-day assignment changed. Review it again before notifying the family.');
    const client = item.clients[0];
    const fresh = await d.contacts(item.clientId, item.agencyId, client, { required: true, allowMissingEmail: true });
    if (JSON.stringify(fresh.contacts) !== JSON.stringify(client.contacts)) throw fail('This family’s contacts changed. Review the recipients again.');
    if (client.mode === 'none' || !client.recipients.length) return { sent: 0, skipped: 1, reason: 'No family contact selected; follow up separately.' };
    // Stable across separate reviews and recovery attempts; no second notice for the same provider/day/client/address.
    const deliveryToken = createHash('sha256').update(`school-roster:${item.agencyId}:${item.providerId}:${item.date}`).digest('hex').slice(0,36);
    const missing = client.recipients.filter(r => !r.email).map(r => ({ status: 'skipped', recipient_name: r.name, recipient_address: '', error_message: 'The selected authorized contact has no email. Follow up through an approved contact method.' }));
    const notices = createCancellationSchoolNoticeService({ database: d.database, sendEmail: async args => {
      const matching = client.recipients.filter(r => r.email.toLowerCase() === args.to);
      let allowed = false;
      for (const r of matching) if (await d.permitted(item.clientId, item.agencyId, r, 'email', {reviewedCancellationToken:item.reviewedCancellationToken,
        reviewedCancellationItemKey:item.reviewedCancellationItemKey,actorUserId})) allowed = true;
      if (!allowed) return { skipped: true, reason: 'Family notification preference or access prevents delivery.' };
      let receipt;
      if (needsCancellationReceipt(item)) {
        receipt = await d.receipts.issue({agencyId:item.agencyId,clientId:item.clientId,providerId:item.providerId,actorUserId,
          schoolHistoryId:historyId,deliveryType:'school_roster',deliveryKey:`${historyId}:${createHash('sha256').update(args.to).digest('hex')}`,
          recipient:args.to,recipientUserId:matching[0]?.userId || null});
        args = appendCancellationReceipt(args,receipt.url);
      }
      try {
        const result = await d.sendEmail({ ...args, clientId: item.clientId });
        if (receipt) await d.receipts.sent(receipt.id,notificationTransportReceipt(result,item.agencyId).accepted ? 'sent' : 'held',result?.communicationId);
        return result;
      } catch (error) { if (receipt) await d.receipts.sent(receipt.id,'review'); throw error; }
    } });
    const deliveries = [];
    let sent = 0, held = 0;
    for (const recipient of client.recipients.filter(r => r.email)) {
      const letter = item.message?.[recipient.role === 'client' ? 'client' : 'guardian'] || item.message;
      const one = await notices.send(deliveryToken, { ...item, recipients: [recipient.email.toLowerCase()], message: { subject: letter.subject || item.message.subject, text: letter.text || item.message.text } }, actorUserId);
      sent += one.sent || 0;
      held += one.held || 0;
      deliveries.push(...(one.deliveries || []));
      if (recipient.role === 'guardian') await textOptedInGuardian(d, item, recipient, actorUserId).catch(() => {});
    }
    const result = { sent, held, deliveries };
    return { ...result, skipped: missing.length, deliveries: [...result.deliveries, ...missing].map(r => ({ ...r,
      recipient_name: r.recipient_name || client.recipients.filter(c => c.email.toLowerCase() === r.recipient_address).map(c => c.name).join(', '), channel: 'email' })) };
  }
  async function send(token, item, actorUserId, { suppressed = false, reviewedCancellationToken, reviewedCancellationItemKey } = {}) {
    item = { ...item, reviewedCancellationToken, reviewedCancellationItemKey };
    const id = await d.history.begin(token, item, actorUserId);
    try {
      const result = suppressed ? { sent: 0, suppressed: 1, reason: 'Emails deferred; follow-up review is required.' } : await deliver(token, item, actorUserId,id);
      await d.history.finish(id, result);
      return result;
    } catch (error) {
      await d.history.finish(id, { sent: 0, held: 1, reason: error.message });
      throw error;
    }
  }
  return { list, readMany, review, send };
}
export const cancellationSchoolRoster = createCancellationSchoolRosterService();
