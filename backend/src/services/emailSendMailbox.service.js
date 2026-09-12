import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import User from '../models/User.model.js';

/** The mailbox shown to the sender must also be the mailbox used on the wire. */
export async function resolveEmailSendMailbox({ agencyId, userId, inbox }) {
  let selected = inbox;
  if (!selected) {
    const { findPersonalInbox } = await import('./personalMailbox.service.js');
    selected = await findPersonalInbox({ agencyId, userId });
  }
  if (!selected?.sender_identity_id || selected.is_active === 0 || Number(selected.agency_id) !== Number(agencyId)) {
    throw Object.assign(new Error('Select a configured work mailbox for this agency'), { status: 400 });
  }
  const agencies = await User.getAgencies(userId);
  if (!agencies.some((a) => Number(a.id) === Number(agencyId)) ||
      (selected.kind === 'personal' && Number(selected.owner_user_id) !== Number(userId))) {
    throw Object.assign(new Error('You cannot send from this mailbox'), { status: 403 });
  }
  const identity = await EmailSenderIdentity.findById(selected.sender_identity_id);
  if (!identity || identity.is_active === 0 || Number(identity.agency_id) !== Number(agencyId) ||
      String(identity.from_email || '').toLowerCase() !== String(selected.from_email || '').toLowerCase()) {
    throw Object.assign(new Error('Work mailbox sender identity is unavailable'), { status: 400 });
  }
  return { inbox: selected, identity, fromEmail: identity.from_email, replyTo: identity.reply_to || identity.from_email, displayName: identity.display_name || selected.display_name };
}
