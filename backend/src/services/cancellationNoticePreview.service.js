import { rewriteHogwartsOutboundRecipient } from '../utils/hogwartsTestEmail.js';
import { resolveRecipientUserIdByEmail } from './emailRecipientLookup.service.js';

/** Read-only envelope preview. These are the same address/subject rules used by
 * the sender; permission, opt-out and transport checks still run at delivery. */
export function createCancellationNoticePreview(overrides = {}) {
  const d = { priority: async args => (await import('./priorityEventEmail.service.js')).priorityEventEmailRecipient(args), redirect: rewriteHogwartsOutboundRecipient,
    recipientUserId: resolveRecipientUserIdByEmail,
    consent: async (...args) => (await import('./sessionNotification.service.js')).loadClientConsent(...args), ...overrides };
  return async function preview(item) {
    if (!item.message || !['appointment', 'school_roster', 'school'].includes(item.kind)) return [];
    const targets = item.kind === 'school' ? (item.recipients || []).map(email => ({ email }))
      : (item.clients || []).filter(client => client.mode !== 'none' && client.channels?.includes('email'))
        .flatMap(client => (client.recipients || []).map(recipient => ({ ...recipient, clientId: client.clientId })));
    const seen = new Set(), previews = [];
    for (const target of targets) {
      const intendedTo = String(target.email || '').trim().toLowerCase();
      const key = `${target.clientId || ''}:${intendedTo}`;
      if (!intendedTo || seen.has(key)) continue;
      seen.add(key);
      const userId = item.kind === 'appointment'
        ? (await d.consent(target.clientId, item.agencyId, target.userId || null)).guardianUserId || null : null;
      const templateType = item.kind === 'appointment' ? 'session_change' : item.kind === 'school_roster' ? 'school_session_notice' : 'school_day_cancellation';
      const envelope = await d.priority({ agencyId: item.agencyId, userId, templateType, to: intendedTo, subject: item.message.subject });
      // Identity sends resolve an absent recipient user only AFTER applying the
      // personal-address subject prefix. Preserve that order for school notices.
      const resolvedUserId = userId || await d.recipientUserId(envelope.to);
      const delivery = await d.redirect({ agencyId: item.agencyId, clientId: target.clientId || null,
        userId: resolvedUserId, to: envelope.to, subject: envelope.subject });
      previews.push({ clientId: target.clientId || null, intendedTo, deliveryTo: delivery.to,
        subject: delivery.subject, redirected: delivery.redirected === true });
    }
    return previews;
  };
}
export const cancellationNoticePreview = createCancellationNoticePreview();
