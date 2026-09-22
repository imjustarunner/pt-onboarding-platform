import pool from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import Directory from './googleWorkspaceDirectory.service.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { getImpersonatedUser } from './unifiedEmail/gmailClient.js';

const verified = new Map();
// Only the app receives Group mail. Invitees may post replies but have NONE
// delivery and cannot view the archive or member list. No public posting.
export async function ensureSupervisionReplyMailbox(agencyId, { replyEmail = null } = {}) {
  const allowed = String(replyEmail || '').trim().toLowerCase();
  if (allowed && !/^[^\s<>@]+@[^\s<>@]+$/.test(allowed)) throw new Error('Invalid invited reply address');
  const cached = verified.get(Number(agencyId));
  if (cached && cached.until > Date.now() && (!allowed || cached.members.has(allowed))) return cached.identity;
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
      await Directory.createGroup({ email: groupEmail, name: 'Meeting replies', description: 'App-managed meeting replies; delivery only to the app mailbox.' });
    }
    const members = await Directory.listGroupMembers(groupEmail);
    if (members.some(member => String(member.email).toLowerCase() !== memberEmail && (member.role !== 'MEMBER' || member.delivery_settings !== 'NONE'))) {
      throw new Error('Meeting reply Group has unexpected delivery members; refusing to expose replies');
    }
    await Directory.applyGroupAccessSettings({ groupEmail, whoCanJoin: 'INVITED_CAN_JOIN', whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW', whoCanViewGroup: 'ALL_MANAGERS_CAN_VIEW', whoCanPostMessage: 'ALL_MEMBERS_CAN_POST', includeInGlobalAddressList: false, isArchived: false });
    await Directory.addGroupMember({ groupEmail, memberEmail });
    await Directory.setGroupMemberDeliverySettings({ groupEmail, memberEmail, deliverySettings: 'ALL_MAIL' });
    if (allowed && allowed !== memberEmail && !members.some(m => String(m.email).toLowerCase() === allowed)) {
      // Set NONE atomically when adding the invited address; never briefly
      // subscribe it to other participants' replies.
      const admin = await Directory.getClient();
      await admin.members.insert({ groupKey: groupEmail, requestBody: { email: allowed, role: 'MEMBER', delivery_settings: 'NONE' } });
    }
    let identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'supervision_replies');
    if (!identity) identity = await EmailSenderIdentity.create({ agencyId, identityKey: 'supervision_replies', displayName: 'Meeting replies', fromEmail: groupEmail, replyTo: groupEmail, inboundAddresses: [groupEmail], isActive: true });
    if (!identity.is_active || identity.from_email !== groupEmail) throw new Error('Meeting reply identity does not match its Group');
    await EmailSenderIdentity.replaceInboundRoutes(identity.id, [groupEmail]);
    verified.set(Number(agencyId), { identity, until: Date.now() + 300_000, members: new Set([...members.map(m=>String(m.email).toLowerCase()),allowed]) });
    return identity;
  } finally {
    if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [lock]);
    db.release();
  }
}
