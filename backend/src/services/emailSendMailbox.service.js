import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import User from '../models/User.model.js';
import { managedDomain } from './managedWorkspaceGroupPolicy.js';
import { workspaceMailboxType } from './workspaceMailboxType.service.js';

/** Keep conversation ownership separate from the address used on the wire. */
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
  const agency = agencies.find((a) => Number(a.id) === Number(agencyId));
  if (!agency ||
      (selected.kind === 'personal' && Number(selected.owner_user_id) !== Number(userId))) {
    throw Object.assign(new Error('You cannot send from this mailbox'), { status: 403 });
  }
  const identity = await EmailSenderIdentity.findById(selected.sender_identity_id);
  if (!identity || identity.is_active === 0 || Number(identity.agency_id) !== Number(agencyId) ||
      String(identity.from_email || '').toLowerCase() !== String(selected.from_email || '').toLowerCase()) {
    throw Object.assign(new Error('Work mailbox sender identity is unavailable'), { status: 400 });
  }
  const personal = selected.kind === 'personal';
  const messages = ['messages', 'messages_at_tenant'].includes(identity.identity_key);
  const flags = typeof agency.feature_flags === 'string' ? JSON.parse(agency.feature_flags || '{}') : agency.feature_flags || {};
  if ((managedDomain(agency) || flags.googleSsoEnabled === true) && (personal || messages)) {
    // Even when messages@ was selected explicitly, use the actor's own mailbox
    // to choose routing. Never move their private conversation to a shared inbox.
    const ownInbox = personal ? selected : await (await import('./personalMailbox.service.js')).findPersonalInbox({ agencyId, userId });
    if (!ownInbox?.from_email || Number(ownInbox.owner_user_id) !== Number(userId)) {
      throw Object.assign(new Error('Configure your work mailbox before sending email.'), { status: 400 });
    }
    const type = await workspaceMailboxType(ownInbox.from_email);
    if (type === 'user') {
      const { resolveMessagesSendMailbox } = await import('./tenantMessageMailboxes.service.js');
      const sender = await resolveMessagesSendMailbox(agencyId);
      if (Number(sender.identity?.agency_id) !== Number(agencyId) || Number(sender.identity?.is_active) === 0) {
        throw Object.assign(new Error('The tenant messages sender is unavailable.'), { status: 400 });
      }
      return { ...sender, inbox: ownInbox, replyTo: ownInbox.from_email, displayName: ownInbox.display_name || identity.display_name, routing: 'workspace_user' };
    }
    if (!personal) return resolveEmailSendMailbox({ agencyId, userId, inbox: ownInbox });
  }
  return { inbox: selected, identity, fromEmail: identity.from_email, replyTo: personal ? identity.from_email : (identity.reply_to || identity.from_email), displayName: identity.display_name || selected.display_name, routing: personal ? 'app_group_alias' : 'shared_team' };
}
