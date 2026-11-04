import pool from '../config/database.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { enrollmentMailBrand } from './portalEmailBranding.service.js';

const email = value => String(value || '').trim().toLowerCase();
const validEmail = value => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
const fail = message => Object.assign(new Error(message), { status: 403, code: 'DAY_CANCELLATION_PROOF_REQUIRED' });
const operationalTypes = new Set(['day_cancellation', 'day_cancellation_contact_followup']);
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
export const isDayCancellationEmail = templateType => operationalTypes.has(String(templateType || '').replace(/^trigger:/, ''));
function addresses(value) {
  if (Array.isArray(value)) return value.flatMap(addresses);
  if (value && typeof value === 'object') return addresses(value.email || value.address);
  return String(value || '').split(',').map(email).filter(Boolean);
}

async function providerForAgency(database, agencyId, providerId) {
  const [[provider]] = await database.execute(`SELECT u.id,u.work_email,u.email,u.first_name,u.last_name,u.preferred_name
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 LIMIT 1`, [agencyId, providerId]);
  if (!provider) throw fail('The provider is no longer active in this agency.');
  return provider;
}

/** One sender contract for booked families, assigned-day families and schools. */
export async function resolveDayCancellationEmail({ agencyId, providerId, providerAuthored, actorUserId,
  reviewedCancellationToken, reviewedCancellationItemKey }, overrides = {}) {
  const d = { database: pool,
    agency: async id => (await import('../models/Agency.model.js')).default.findById(id),
    domain: async id => (await import('./tenantMessageMailboxes.service.js')).inferAgencyMailDomain(id),
    personal: async args => (await import('./emailSendMailbox.service.js')).resolveEmailSendMailbox(args),
    messages: async id => (await import('./tenantMessageMailboxes.service.js')).resolveMessagesSendMailbox(id),
    ...overrides };
  const provider = await providerForAgency(d.database, agencyId, providerId);
  const providerEmail = email(provider.work_email || provider.email);
  const agency = await d.agency(agencyId), domain = email(await d.domain(agencyId));
  const supportEmail = `support@${domain}`;
  if (!agency || !validEmail(providerEmail) || !validEmail(supportEmail)) throw fail('Configure the provider work email and agency support mailbox.');
  if (providerAuthored && Number(actorUserId) !== Number(providerId)) throw fail('Provider-authored email must come from the provider’s reviewed action.');
  const mailbox = providerAuthored ? await d.personal({ agencyId, userId: providerId }) : await d.messages(agencyId);
  if (!mailbox?.identity?.id || Number(mailbox.identity.agency_id) !== Number(agencyId) || Number(mailbox.identity.is_active) === 0) throw fail('The cancellation sender is unavailable in this agency.');
  const providerName = [provider.preferred_name || provider.first_name, provider.last_name].filter(Boolean).join(' ') || 'Your provider';
  const displayName = providerAuthored ? providerName : `${agency.official_name || agency.name} Care Team`;
  return { senderIdentityId: mailbox.identity.id, fromDisplayNameOverride: displayName,
    replyToOverride: providerEmail, cc: [supportEmail], providerEmail, supportEmail,
    portalEmailBrand: { ...enrollmentMailBrand({ agency, domain, school: true }), replyTo: providerEmail, displayName },
    source: 'manual', ...(reviewedCancellationToken ? { reviewedCancellationToken } : {}),
    ...(reviewedCancellationItemKey ? { reviewedCancellationItemKey } : {}) };
}

/** The opaque review reference is authority only after the saved server plan was
 * reviewed and signed. Generic mail parameters cannot grant this exception. */
export async function reviewedDayCancellationContext(input, overrides = {}) {
  if (!isDayCancellationEmail(input.templateType)) return null;
  const d = { database: pool, decrypt: maybeDecryptNotePayload,
    domain: async id => (await import('./tenantMessageMailboxes.service.js')).inferAgencyMailDomain(id), ...overrides };
  let proof = input, persisted = false;
  if (input.existingCommunicationId) {
    const [[communication]] = await d.database.execute('SELECT metadata,agency_id,recipient_address FROM user_communications WHERE id=?', [input.existingCommunicationId]);
    if (!communication || Number(communication.agency_id) !== Number(input.agencyId)
        || JSON.stringify(addresses(communication.recipient_address).sort()) !== JSON.stringify(addresses(input.to).sort())) throw fail('This cancellation communication belongs to another recipient or agency.');
    const metadata = parse(communication?.metadata || {});
    if (metadata.reviewedCancellationToken || metadata.reviewedCancellationItemKey) { proof = metadata; persisted = true; }
  }
  const token = proof.reviewedCancellationToken, itemKey = proof.reviewedCancellationItemKey;
  if (!/^[a-f0-9-]{36}$/i.test(String(token || '')) || !itemKey) throw fail('This cancellation email needs a signed recipient review.');
  const [[row]] = await d.database.execute('SELECT * FROM provider_day_cancellations WHERE token=?', [token]);
  if (!row || !row.signed_at || !['processing', 'partial', 'completed'].includes(row.status)) throw fail('The cancellation review has not been signed.');
  const raw = typeof row.plan_json === 'string' ? row.plan_json : JSON.stringify(row.plan_json);
  const plan = parse(d.decrypt(raw));
  const item = plan.items?.find(value => value.key === itemKey);
  if (!plan.messagesReviewed || !plan.facts?.reasonCategory || plan.facts.notificationMode === 'none'
      || !item || !['appointment', 'school_roster', 'school'].includes(item.kind)
      || Number(item.agencyId) !== Number(input.agencyId) || Number(plan.providerId) !== Number(row.provider_id)
      || !plan.scopes?.some(scope => Number(scope.agencyId) === Number(input.agencyId))
      || (!persisted && Number(input.generatedByUserId) !== Number(row.actor_user_id))) throw fail('The cancellation review does not authorize this email.');
  let permitted;
  if (String(input.templateType).replace(/^trigger:/, '') === 'day_cancellation_contact_followup') {
    const provider = await providerForAgency(d.database, input.agencyId, plan.providerId);
    permitted = [email(provider.work_email || provider.email), `support@${email(await d.domain(input.agencyId))}`];
  } else {
    const clients = item.clients || [];
    if (input.clientId && !clients.some(client => Number(client.clientId) === Number(input.clientId))) throw fail('The cancellation email belongs to another client.');
    permitted = item.kind === 'school' ? addresses(item.recipients)
      : clients.flatMap(client => client.mode === 'none' ? [] : (client.recipients || []).map(recipient => email(recipient.email)).filter(Boolean));
  }
  const destinations = addresses(input.to);
  if (!destinations.length || destinations.some(address => !validEmail(address) || !permitted.includes(address))) throw fail('This recipient was not included in the signed cancellation review.');
  if(overrides.verifyEnvelope) {
    const support=`support@${email(await d.domain(input.agencyId))}`;
    if(!validEmail(support)) throw fail('Configure the approved agency support mailbox before sending.');
    const report=String(input.templateType).replace(/^trigger:/,'')==='day_cancellation_contact_followup';
    const verifyCopies=envelope=>{
      const copies=addresses(envelope.cc);
      if(addresses(envelope.bcc).length || copies.some(address=>!validEmail(address) || address!==support)
        || (!report && !copies.includes(support))) throw fail('Cancellation email may copy only the approved support mailbox and cannot add BCC recipients.');
    };
    verifyCopies(input);
    if(persisted)verifyCopies(proof);
  }
  return { row, plan, item, providerId: Number(plan.providerId), actorUserId: Number(row.actor_user_id),
    reviewedCancellationToken: token, reviewedCancellationItemKey: itemKey };
}
