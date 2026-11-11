import pool from '../config/database.js';
import Directory from './googleWorkspaceDirectory.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';
import { managedDomain } from './managedWorkspaceGroupPolicy.js';
import { relaySelected, relayConfiguration } from './workspaceRelayConfig.js';
import { verifyWorkspaceRelaySender } from './workspaceRelaySender.js';
import { APP_GROUP_OWNER, APP_GROUP_MANAGER } from './appGroupOwnership.service.js';

/** Provision events@ through the established Group + approved relay path.
 * Never grows the shared mailbox's Gmail alias list or enables an unapproved domain.
 */
export async function provisionCompanyEventEmailSenders({ apply = false, agencyIds = [], domain = null, db = pool,
  directory = Directory, identities = EmailSenderIdentity, inboxes = CommunicationInbox, env = process.env,
  verify = verifyWorkspaceRelaySender } = {}) {
  const [rows] = await db.execute("SELECT id,name,slug,is_active,organization_type,feature_flags FROM agencies WHERE is_active = 1 AND COALESCE(is_archived, 0) = 0 AND organization_type = 'agency' ORDER BY id");
  const selected = new Set(agencyIds.map(Number)), results = [];
  for (const agency of rows || []) {
    if (selected.size && !selected.has(Number(agency.id))) continue;
    const emailDomain = managedDomain(agency);
    if (!emailDomain || domain && emailDomain !== domain) continue;
    const email = `events@${emailDomain}`;
    const existing = await identities.findByAgencyAndIdentityKey(agency.id, 'events', { includeInactive: true });
    if (existing && ![true, 1, '1'].includes(existing.is_active)) {
      results.push({ agencyId: Number(agency.id), email, status: 'disabled_identity_preserved' }); continue;
    }
    try {
      if (existing && String(existing.from_email).toLowerCase() !== email) {
        throw Object.assign(new Error('An events identity already uses another address; review that identity before provisioning.'), { code: 'EVENT_IDENTITY_ADDRESS_CONFLICT' });
      }
      if (!relaySelected(email, env)) throw Object.assign(new Error('This domain does not have an approved Workspace relay route for events@.'), { code: 'EVENT_RELAY_ROUTE_REQUIRED' });
      relayConfiguration(env);
      if (!apply) {
        results.push({ agencyId: Number(agency.id), email, status: existing ? 'existing_identity' : 'ready_to_provision' }); continue;
      }
      let group = await directory.getGroup({ groupEmail: email, strictNotFound: true });
      if (!group) group = await directory.createGroup({ email, name: `${agency.name} Events`, description: 'App-managed company event invitations and replies.',
        whoCanPostMessage: 'ANYONE_CAN_POST', allowExternalMembers: false, includeInGlobalAddressList: true });
      await directory.applyGroupAccessSettings({ groupEmail: email, allowExternalMembers: false, whoCanPostMessage: 'ANYONE_CAN_POST',
        whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW', whoCanJoin: 'INVITED_CAN_JOIN' });
      // The Directory list endpoint omits delivery_settings. The app's ownership
      // helper sets and verifies each subscription through members.get instead.
      const members = [
        await directory.addGroupMember({ groupEmail: email, memberEmail: APP_GROUP_OWNER, role: 'OWNER' }),
        await directory.addGroupMember({ groupEmail: email, memberEmail: APP_GROUP_MANAGER, role: 'MANAGER' })
      ];
      if (!members.some(m => String(m.email).toLowerCase() === APP_GROUP_OWNER && m.role === 'OWNER' && ['NONE','DISABLED'].includes(m.delivery_settings))
        || !members.some(m => String(m.email).toLowerCase() === APP_GROUP_MANAGER && m.role === 'MANAGER' && m.delivery_settings === 'ALL_MAIL')) {
        throw Object.assign(new Error('The events Group ownership and subscriptions did not verify.'), { code: 'EVENT_GROUP_MEMBERSHIP_UNVERIFIED' });
      }
      const identity = existing || await identities.create({ agencyId: Number(agency.id), identityKey: 'events', displayName: `${agency.name} Events`,
        fromEmail: email, replyTo: email, inboundAddresses: [email], isActive: true });
      await verify(email, { db, directory, env });
      await identities.replaceInboundRoutes(identity.id, [email]);
      await inboxes.ensureFromSenderIdentities?.(agency.id);
      results.push({ agencyId: Number(agency.id), email, status: 'ready', identityId: Number(identity.id), transport: 'workspace_smtp_relay' });
    } catch (e) {
      results.push({ agencyId: Number(agency.id), email, status: 'blocked', reason: e.code || 'EVENT_SENDER_SETUP_FAILED' });
    }
  }
  return results;
}
