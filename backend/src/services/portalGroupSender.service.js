import { APP_GROUP_OWNER } from './appGroupOwnership.service.js';
import Directory from './googleWorkspaceDirectory.service.js';
import { ensureSendAsAlias } from './gmailSendAs.service.js';
import { APP_EMAIL_TRANSPORT } from './unifiedEmail/transportMailbox.js';

export const PORTAL_GROUP_DESCRIPTION = 'Application-managed portal correspondence group. Delivery remains in the application mailbox.';
export const PORTAL_GROUP_SETTINGS = Object.freeze({
  allowExternalMembers: false,
  whoCanJoin: 'INVITED_CAN_JOIN',
  whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW',
  whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
  whoCanPostMessage: 'ANYONE_CAN_POST',
  includeInGlobalAddressList: false,
  isArchived: false,
  membersCanPostAsTheGroup: true
});
const fail = (code, message) => Object.assign(new Error(message), { code, status: 503 });

// A Google Group owns the public address; Gmail Send As only authorizes the
// application's transport mailbox to send for it. Never create user aliases.
export async function ensurePortalDeliveryGroup({ address, displayName, directory = Directory }) {
  const email = String(address || '').trim().toLowerCase();
  if (!/^portal@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) throw fail('PORTAL_GROUP_ADDRESS_INVALID', 'A portal group address is required.');
  let group;
  try { group = await directory.getGroup({ groupEmail: email, strictNotFound: true }); }
  catch (error) {
    // Google can return 403 for an address assigned to a user. Distinguish that
    // from lack of directory permission without attempting a blind creation.
    if (Number(error.code || error.response?.status) !== 403) throw error;
    if (await directory.getUser({ primaryEmail: email })) throw fail('PORTAL_USER_ALIAS_CONFLICT', 'This portal address belongs to a user account. Convert it to a Google Group before sending.');
    throw error;
  }
  if (!group) {
    if (await directory.getUser({ primaryEmail: email })) throw fail('PORTAL_USER_ALIAS_CONFLICT', 'This portal address belongs to a user account. Convert it to a Google Group before sending.');
    try { group = await directory.createGroup({ email, name: displayName, description: PORTAL_GROUP_DESCRIPTION, ...PORTAL_GROUP_SETTINGS }); }
    catch (error) {
      if (Number(error.code || error.response?.status) !== 409) throw error;
      group = await directory.getGroup({ groupEmail: email, strictNotFound: true });
      if (!group) throw error;
    }
  }
  if (group.description === PORTAL_GROUP_DESCRIPTION) {
    // Run again after partial provisioning failures; configure privacy before
    // verifying the owner and application manager memberships.
    await directory.applyGroupAccessSettings({ groupEmail: email, ...PORTAL_GROUP_SETTINGS });
  }
  await directory.addGroupMember({ groupEmail: email, memberEmail: APP_GROUP_OWNER, memberType: 'USER', role: 'OWNER' });
  await directory.addGroupMember({ groupEmail: email, memberEmail: APP_EMAIL_TRANSPORT, memberType: 'USER', role: 'MANAGER' });
  return group;
}

const ready = new Map();
const pending = new Map();
export async function ensurePortalGroupSender({ address, displayName }) {
  const key = `${address}|${displayName}`;
  if ((ready.get(key) || 0) > Date.now()) return;
  if (pending.has(key)) return pending.get(key);
  const work = (async () => {
    await ensurePortalDeliveryGroup({ address, displayName });
    const result = await ensureSendAsAlias({ sendAsEmail: address, displayName, treatAsAlias: false });
    if (!result.ok || result.sendAs?.verificationStatus !== 'accepted') {
      throw Object.assign(fail('PORTAL_GROUP_SENDER_NOT_READY', 'The portal group is not yet verified for sending.'), { retryAt: result.retryAt || null });
    }
    ready.set(key, Date.now() + 10 * 60 * 1000);
  })();
  pending.set(key, work);
  try { await work; } finally { pending.delete(key); }
}
