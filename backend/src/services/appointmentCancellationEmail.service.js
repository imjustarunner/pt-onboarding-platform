import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

const email = value => String(value || '').trim().toLowerCase();
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const validEmail = value => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const fail = message => Object.assign(new Error(message), { status: 403, code: 'INDIVIDUAL_CANCELLATION_PROOF_REQUIRED' });
const canceledStatuses = new Set(['canceled', 'cancelled', 'canceled_by_provider', 'canceled_by_client',
  'canceled_by_guardian', 'canceled_by_organization', 'canceled_by_agency', 'late_canceled']);
const type = value => String(value || '').replace(/^trigger:/, '');
function addresses(value) {
  if (Array.isArray(value)) return value.flatMap(addresses);
  if (value && typeof value === 'object') return addresses(value.email || value.address);
  return String(value || '').split(',').map(email).filter(Boolean);
}
const sameSet = (left, right) => JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const hashFacts = facts => createHash('sha256').update(JSON.stringify(canonical(facts))).digest('hex');
function timestamp(value) {
  const date = value instanceof Date ? value : new Date(typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(value) ? `${value.replace(' ', 'T')}Z` : value);
  return value && Number.isFinite(+date) ? date.toISOString() : null;
}
function sendAllowed(facts) {
  return facts?.eventType === 'canceled' && facts.signatureConfirmed === true && facts.notificationMode === 'send'
    && !facts.reviewedCancellation && !facts.reviewedCancellationToken && !facts.notificationRecipients
    && !['client', 'guardian', 'client_guardian'].includes(facts.cancellationActorRole)
    && !facts.suppressionReason;
}
const defaults = {
  database: pool, decrypt: maybeDecryptNotePayload,
  appointment: async (id, database) => (await import('../models/Appointment.model.js')).default.findById(id, { executor: database }),
  participants: async (id, database) => (await import('../models/Appointment.model.js')).default.listParticipants(id, { executor: database }),
  review: async (...args) => (await import('./cancellationRecipients.service.js')).cancellationRecipients.review(...args),
  currentRecipient: async (...args) => (await import('./cancellationRecipients.service.js')).cancellationRecipients.operationalEmailPermitted(...args),
  domain: async id => (await import('./tenantMessageMailboxes.service.js')).inferAgencyMailDomain(id)
};
async function signedWorkflow(d, appointment, clientId, actorUserId) {
  if (!positiveId(appointment?.id) || !positiveId(appointment.agencyId) || !positiveId(appointment.providerUserId)
      || !positiveId(clientId) || !positiveId(actorUserId) || !canceledStatuses.has(appointment.status)) return null;
  const [[row]] = await d.database.execute('SELECT * FROM appointment_change_workflows WHERE appointment_id=?', [appointment.id]);
  if (!row || Number(row.appointment_id) !== Number(appointment.id) || Number(row.agency_id) !== Number(appointment.agencyId)
      || !['completing', 'completed'].includes(row.status) || Number(row.signed_by_user_id) !== Number(actorUserId)
      || !timestamp(row.signed_at)) return null;
  let facts;
  try { facts = parse(row.facts_json); } catch { return null; }
  if (!sendAllowed(facts) || !(await d.participants(appointment.id, d.database)).some(p => Number(p.clientId) === Number(clientId))) return null;
  return { row, signedAt: timestamp(row.signed_at), factsHash: hashFacts(facts) };
}

/** Only the saved staff signature can create an operational email snapshot.
 * Guardian portal permissions and ordinary reminder selection remain separate. */
export async function prepareIndividualCancellationReview({ appointment, clientId, actorUserId }, overrides = {}) {
  const d = { ...defaults, ...overrides };
  const signed = await signedWorkflow(d, appointment, clientId, actorUserId);
  if (!signed) return null;
  const review = await d.review(clientId, appointment.agencyId, undefined, { required: false, allowMissingEmail: true });
  return { appointmentId: Number(appointment.id), clientId: Number(clientId), providerId: Number(appointment.providerUserId),
    signedAt: signed.signedAt, factsHash: signed.factsHash, mode: review.mode, channels: ['email'],
    contacts: JSON.parse(JSON.stringify(review.contacts)), recipients: JSON.parse(JSON.stringify(review.recipients)) };
}

/** Resolve authority from the communication's encrypted server-created notice,
 * never a caller-supplied template flag or recipient snapshot. Recheck on retry. */
export async function individualCancellationEmailContext(input, overrides = {}) {
  if (type(input.templateType) !== 'session_cancellation' || !positiveId(input.existingCommunicationId)) return null;
  const d = { ...defaults, ...overrides };
  const [[communication]] = await d.database.execute(`SELECT agency_id,client_id,recipient_address,template_type,channel,generated_by_user_id,metadata
    FROM user_communications WHERE id=?`, [input.existingCommunicationId]);
  if (!communication) return null;
  let metadata;
  try { metadata = parse(communication.metadata || {}); } catch { throw fail('The cancellation communication metadata needs review.'); }
  if (!Object.hasOwn(metadata || {}, 'scheduleNoticeBatchId')) return null;
  if (!positiveId(metadata.scheduleNoticeBatchId)) throw fail('The cancellation communication has no valid saved notice batch.');
  const [rows] = await d.database.execute('SELECT * FROM appointment_schedule_notices WHERE batch_id=? ORDER BY id', [metadata.scheduleNoticeBatchId]);
  if (!rows.length) throw fail('The saved cancellation notice is no longer available.');
  let entries;
  try { entries = rows.map(row => ({ row, payload: parse(d.decrypt(typeof row.payload_json === 'string' ? row.payload_json : JSON.stringify(row.payload_json))) })); }
  catch { throw fail('The saved cancellation recipient review could not be read.'); }
  if (!entries.some(entry => entry.payload?.individualCancellationReview)) return null;
  const destinations = addresses(input.to);
  if (Number(communication.agency_id) !== Number(input.agencyId) || Number(communication.client_id) !== Number(input.clientId)
      || !positiveId(input.clientId) || type(communication.template_type) !== 'session_cancellation' || communication.channel !== 'email'
      || !sameSet(addresses(communication.recipient_address), destinations) || !destinations.length || destinations.some(to => !validEmail(to))
      || !Array.isArray(metadata.appointmentIds) || !sameSet(metadata.appointmentIds.map(Number), rows.map(row => Number(row.appointment_id)))) {
    throw fail('This cancellation communication belongs to another recipient, client, appointment or agency.');
  }
  let providerId = null, actorUserId = null;
  for (const { row, payload } of entries) {
    const review = payload?.individualCancellationReview;
    if (!review || !['sending', 'processed'].includes(row.status) || row.event_type !== 'canceled' || payload.eventType !== 'canceled'
        || !sendAllowed(payload.facts) || Number(row.batch_id) !== Number(metadata.scheduleNoticeBatchId)
        || Number(row.agency_id) !== Number(input.agencyId) || Number(row.client_id) !== Number(input.clientId)
        || Number(review.appointmentId) !== Number(row.appointment_id) || Number(review.clientId) !== Number(row.client_id)
        || Number(review.providerId) !== Number(row.provider_id) || !positiveId(row.created_by_user_id)
        || Number(communication.generated_by_user_id) !== Number(row.created_by_user_id)
        || !Array.isArray(review.contacts) || !Array.isArray(review.recipients) || review.mode === 'none'
        || !Array.isArray(review.channels) || !review.channels.includes('email')) {
      throw fail('The saved notice does not authorize this cancellation email.');
    }
    if ((providerId && providerId !== Number(row.provider_id)) || (actorUserId && actorUserId !== Number(row.created_by_user_id))) {
      throw fail('Review mixed provider cancellations separately before sending.');
    }
    providerId = Number(row.provider_id); actorUserId = Number(row.created_by_user_id);
    const appointment = await d.appointment(row.appointment_id, d.database);
    const signed = await signedWorkflow(d, appointment, row.client_id, actorUserId);
    if (!signed || Number(appointment.agencyId) !== Number(input.agencyId) || Number(appointment.providerUserId) !== providerId
        || signed.signedAt !== review.signedAt || signed.factsHash !== review.factsHash) {
      throw fail('The signed cancellation or appointment has changed. Review it again before sending.');
    }
    for (const destination of destinations) {
      const recipients = review.recipients.filter(recipient => recipient.enabled !== false && email(recipient.email) === destination);
      let allowed = false;
      for (const recipient of recipients) if (await d.currentRecipient(row.client_id, row.agency_id, recipient, review.contacts)) allowed = true;
      if (!allowed) throw fail('The reviewed family contact or notification permission has changed. Review the recipients again.');
    }
  }
  if (overrides.verifyEnvelope) {
    const support = `support@${email(await d.domain(input.agencyId))}`;
    const verifyCopies = (envelope, requireSupport = true) => {
      const copies = addresses(envelope.cc);
      if (!validEmail(support) || (requireSupport && !copies.includes(support)) || copies.some(copy => copy !== support) || addresses(envelope.bcc).length) {
        throw fail('Cancellation email may copy only the approved support mailbox and cannot add BCC recipients.');
      }
    };
    verifyCopies(input);
    // The queue logs the communication before the sender adds its first CC.
    // On retries, reject any unauthorized copies already saved by that sender.
    verifyCopies(metadata, Object.hasOwn(metadata, 'cc'));
  }
  return { providerId, actorUserId, agencyId: Number(input.agencyId), clientId: Number(input.clientId),
    individualCancellation: true, plan: { facts: { providerAuthored: providerId === actorUserId } } };
}
