import {assertSpanishGroupSender} from './managedWorkspaceGroupAccess.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import User from '../models/User.model.js';
import { managedDomain } from './managedWorkspaceGroupPolicy.js';
import { workspaceMailboxType } from './workspaceMailboxType.service.js';
import { assertDepartmentalGroupAccess, groupKeyForIdentity } from './departmentalGroupAccess.service.js';
import { nluTutoringQaMailDomain } from '../utils/nluTutoringQaPolicy.js';
import { normalizeStaffContactAddress } from '../utils/staffContactAddress.js';

/** Keep conversation ownership separate from the address used on the wire. */
export async function resolveEmailSendMailbox({ agencyId, userId, inbox, keepMessagesRoute = false, optional = false }) {
  let selected = inbox;
  if (!selected) {
    const { findPersonalInbox } = await import('./personalMailbox.service.js');
    selected = await findPersonalInbox({ agencyId, userId });
  }
  if (!selected && optional) return null;
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
  if(identity.identity_key==='spanish')await assertSpanishGroupSender(agencyId,userId);
  const departmentalGroupKey = groupKeyForIdentity({ ...identity, kind: selected.kind, owner_user_id: selected.owner_user_id });
  if (departmentalGroupKey) await assertDepartmentalGroupAccess({ agencyId, userId, groupKey: departmentalGroupKey });
  const personal = selected.kind === 'personal';
  const messages = ['messages', 'messages_at_tenant'].includes(identity.identity_key);
  const flags = typeof agency.feature_flags === 'string' ? JSON.parse(agency.feature_flags || '{}') : agency.feature_flags || {};
  if (messages && nluTutoringQaMailDomain(agency)) {
    // Synthetic staff do not acquire a real Workspace mailbox by opening
    // Messages. Keep the already authorized QA inbox and guarded shared sender.
    const { resolveMessagesSendMailbox } = await import('./tenantMessageMailboxes.service.js');
    const sender = await resolveMessagesSendMailbox(agencyId);
    if (Number(sender.identity?.agency_id) !== Number(agencyId) || Number(sender.identity?.id) !== Number(identity.id)
      || Number(sender.identity?.is_active) !== 1 || !sender.identity?.qaSenderSource) {
      throw Object.assign(new Error('The QA messages sender is unavailable.'), { status: 400 });
    }
    return { ...sender, inbox: selected, routing: 'shared_team' };
  }
  const actor = personal || messages ? await User.findById(userId) : null;
  const flag = value => [true, 1, '1'].includes(value);
  const groupLogin = flag(actor?.sso_password_override) || flag(actor?.login_is_group_email);
  const ssoEnabled = !!managedDomain(agency) || flags.googleSsoEnabled === true;
  if (messages && keepMessagesRoute && ssoEnabled && !groupLogin) {
    if (!/^messages@[^@\s]+$/i.test(identity.from_email)) {
      throw Object.assign(new Error('The agency Messages sender is unavailable.'), { status: 400 });
    }
    return { inbox: selected, identity, fromEmail: identity.from_email, replyTo: identity.from_email, displayName: identity.display_name, routing: 'shared_team' };
  }
  if (personal || (messages && (groupLogin || ssoEnabled))) {
    // Even when messages@ was selected explicitly, use the actor's own mailbox
    // to choose routing. Never move their private conversation to a shared inbox.
    const ownInbox = personal ? selected : await (await import('./personalMailbox.service.js')).findPersonalInbox({ agencyId, userId });
    if (!ownInbox?.from_email || Number(ownInbox.owner_user_id) !== Number(userId)) {
      throw Object.assign(new Error('Configure your work mailbox before sending email.'), { status: 400 });
    }
    const workAddress = normalizeStaffContactAddress(ownInbox.from_email);
    if (!actor || !workAddress || workAddress === normalizeStaffContactAddress(actor.personal_email)) {
      throw Object.assign(new Error('Configure a verified work mailbox before sending email.'), { status: 400 });
    }
    const type = await workspaceMailboxType(workAddress);
    if (!ssoEnabled || groupLogin) {
      if (type !== 'group') {
        throw Object.assign(new Error('Configure your work group email before sending email.'), { status: 400 });
      }
    } else if (type === 'user') {
      const { resolveMessagesSendMailbox } = await import('./tenantMessageMailboxes.service.js');
      const sender = await resolveMessagesSendMailbox(agencyId);
      if (Number(sender.identity?.agency_id) !== Number(agencyId) || Number(sender.identity?.is_active) === 0) {
        throw Object.assign(new Error('The tenant messages sender is unavailable.'), { status: 400 });
      }
      return { ...sender, inbox: ownInbox, replyTo: sender.fromEmail, displayName: ownInbox.display_name || identity.display_name, routing: 'workspace_user' };
    }
    if (!personal) return resolveEmailSendMailbox({ agencyId, userId, inbox: ownInbox });
  }
  return { inbox: selected, identity, fromEmail: identity.from_email, replyTo: personal ? identity.from_email : (identity.reply_to || identity.from_email), displayName: identity.display_name || selected.display_name, routing: personal ? 'app_group_alias' : 'shared_team' };
}
