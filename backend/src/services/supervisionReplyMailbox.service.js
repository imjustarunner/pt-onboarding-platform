import pool from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import Directory from './googleWorkspaceDirectory.service.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { getImpersonatedUser } from './unifiedEmail/gmailClient.js';

const verified = new Map();
// A dedicated Group delivers only to the app. Using messages@ here would send
// copies to its human members before the host has a chance to read in the app.
export async function ensureSupervisionReplyMailbox(agencyId) {
  const cached = verified.get(Number(agencyId));
  if (cached && cached.until > Date.now()) return cached.identity;
  const domain = await inferAgencyMailDomain(agencyId);
  const memberEmail = String(getImpersonatedUser() || '').toLowerCase();
  if (!domain || !memberEmail) throw new Error('Supervision reply mailbox is not configured');
  const groupEmail = `supervision-replies@${domain}`;
  const db = await pool.getConnection();
  const lock = `supervision-reply-mailbox:${agencyId}`;
  let acquired = false;
  try {
    const [[row]] = await db.execute('SELECT GET_LOCK(?,10) acquired', [lock]);
    acquired = !!row.acquired;
    if (!acquired) throw new Error('Supervision reply mailbox provisioning is busy');
    if (!await Directory.getGroup({ groupEmail })) {
      await Directory.createGroup({ email: groupEmail, name: 'Supervision replies', description: 'App-managed supervision replies; delivery only to the app mailbox.' });
    }
    const members = await Directory.listGroupMembers(groupEmail);
    if (members.some(member => String(member.email).toLowerCase() !== memberEmail)) {
      throw new Error('Supervision reply Group has unexpected members; refusing to expose replies');
    }
    await Directory.applyGroupAccessSettings({ groupEmail, whoCanJoin: 'INVITED_CAN_JOIN', whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW', whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW', whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST', includeInGlobalAddressList: false, isArchived: false });
    await Directory.addGroupMember({ groupEmail, memberEmail });
    await Directory.setGroupMemberDeliverySettings({ groupEmail, memberEmail, deliverySettings: 'ALL_MAIL' });
    let identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'supervision_replies');
    if (!identity) identity = await EmailSenderIdentity.create({ agencyId, identityKey: 'supervision_replies', displayName: 'Supervision replies', fromEmail: groupEmail, replyTo: groupEmail, inboundAddresses: [groupEmail], isActive: true });
    if (!identity.is_active || identity.from_email !== groupEmail) throw new Error('Supervision reply identity does not match its Group');
    await EmailSenderIdentity.replaceInboundRoutes(identity.id, [groupEmail]);
    verified.set(Number(agencyId), { identity, until: Date.now() + 300_000 });
    return identity;
  } finally {
    if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [lock]);
    db.release();
  }
}
