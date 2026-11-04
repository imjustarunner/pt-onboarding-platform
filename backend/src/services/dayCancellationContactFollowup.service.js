import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';

function initialsFor(client, item) {
  const saved = String(client.clientInitials || item.source?.assignment?.client_initials || '').trim();
  if (saved && saved.length <= 12) return saved;
  return String(client.clientName || '').trim().split(/\s+/).filter(Boolean).map(part => part[0]).join('').toUpperCase() || 'Unknown initials';
}

/** Contact gaps are separate follow-up work; they must not prevent the provider's absence. */
export function missingDayCancellationContacts(plan, results, agencyId) {
  const missing = new Map();
  for (const item of plan.items) {
    if (Number(item.agencyId) !== Number(agencyId) || !['appointment', 'school_roster'].includes(item.kind) || results[item.key]?.status !== 'completed') continue;
    for (const client of item.clients || []) {
      const recipients = client.mode === 'none' ? [] : (client.recipients || []);
      const hasEmail = recipients.some(contact => String(contact.email || '').trim());
      const delivery = results[item.key]?.notificationDelivery;
      let reason = client.mode === 'none' ? 'No family contact selected.'
        : !recipients.length ? 'No authorized email contact selected or linked.'
          : !hasEmail ? 'No email on the selected authorized contact.' : '';
      if (reason && client.contactIssue) reason = client.contactIssue;
      if (!reason && !Number(delivery?.sent || 0) && (delivery?.deliveries || []).some(row => /no permitted contact|no family email|notification preference|access prevents|missing.*contact/i.test(row.error_message || row.reason || ''))) reason = 'No permitted email contact was available.';
      if (!reason) continue;
      const key = `${client.clientId}:${item.date}`;
      missing.set(key, { clientId:client.clientId, initials:initialsFor(client,item), date:item.date || plan.date, reason, itemKey:item.key });
    }
  }
  return [...missing.values()];
}

export function createDayCancellationContactFollowup(overrides = {}) {
  const d = {
    sender: async args => (await import('./dayCancellationEmail.service.js')).resolveDayCancellationEmail(args),
    send: async args => (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity(args),
    ...overrides
  };
  return async function send({ token, plan, results, agencyId, actorUserId }) {
    const clients = missingDayCancellationContacts(plan,results,agencyId);
    if (!clients.length) return { status:'not_needed', count:0 };
    const sender = await d.sender({ agencyId, providerId:plan.providerId, providerAuthored:plan.facts.providerAuthored, actorUserId,
      reviewedCancellationToken:token, reviewedCancellationItemKey:clients[0].itemKey });
    const to = [...new Set([sender.supportEmail,sender.providerEmail].filter(Boolean))];
    if (!to.length) throw new Error('The provider and support follow-up recipients are not configured.');
    const subject = `Cancellation contact follow-up — ${plan.dates.join(', ')}`;
    const text = `The provider's cancellation was recorded. These families could not be notified because contact information was missing or inadequate. Follow up through an approved contact method.\n\n${clients.map(client => `${client.initials} — ${client.date}: ${client.reason}`).join('\n')}\n\nClient initials are listed here; review the authorized school portal for contact details.`;
    const result = await d.send({ ...sender, agencyId, providerId:plan.providerId, to:to.join(', '), cc:null,
      subject, text, templateType:'day_cancellation_contact_followup', source:'manual', generatedByUserId:actorUserId,
      reviewedCancellationToken:token, reviewedCancellationItemKey:clients[0].itemKey });
    const receipt = notificationTransportReceipt(result,agencyId);
    return { status:receipt.accepted ? 'sent' : 'held', count:clients.length, communicationId:result?.communicationId || null,
      ...(receipt.accepted ? {} : { message:result?.reason || 'The contact follow-up email needs delivery review.' }) };
  };
}

export const dayCancellationContactFollowup = createDayCancellationContactFollowup();
