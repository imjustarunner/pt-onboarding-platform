import Directory from './googleWorkspaceDirectory.service.js';
import { APP_GROUP_OWNER, APP_GROUP_MANAGER } from './appGroupOwnership.service.js';

/** Resolve an existing account or provision a new application address as a
 * Google Group. Preserve aliases owned by individual staff; only the shared
 * application transport aliases require explicit migration.
 */
export async function ensureWorkspaceSenderGroup({ email, displayName, directory = Directory }) {
  let group;
  try { group = await directory.getGroup({ groupEmail: email, strictNotFound: true }); }
  catch (error) {
    if (Number(error.code || error.response?.status) !== 403) throw error;
    const user = await directory.getUser({ primaryEmail: email });
    if (!user) throw error;
    if (String(user.primaryEmail).toLowerCase() === String(email).toLowerCase()
        || String(user.primaryEmail).toLowerCase() !== APP_GROUP_MANAGER) return { existingUser: true };
    throw Object.assign(new Error('This address is an alias of the shared application mailbox. Convert that app alias to a Google Group before provisioning.'), { code: 'APP_SENDER_ALIAS_CONFLICT' });
  }
  if (!group) {
    const user = await directory.getUser({ primaryEmail: email });
    if (user) {
      if (String(user.primaryEmail).toLowerCase() === String(email).toLowerCase()
        || String(user.primaryEmail).toLowerCase() !== APP_GROUP_MANAGER) return { existingUser: true };
      throw Object.assign(new Error('This address is an alias of the shared application mailbox. Convert that app alias to a Google Group before provisioning.'), { code: 'APP_SENDER_ALIAS_CONFLICT' });
    }
  }
  if (!group) {
    try {
      group = await directory.createGroup({ email, name: displayName || email,
        description: 'Application-managed correspondence group.',
        whoCanJoin: 'INVITED_CAN_JOIN', whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW',
        whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW', whoCanPostMessage: 'ANYONE_CAN_POST',
        allowExternalMembers: false, includeInGlobalAddressList: false, isArchived: false });
    } catch (error) {
      if (Number(error.code || error.response?.status) !== 409) throw error;
      group = await directory.getGroup({ groupEmail: email, strictNotFound: true });
      if (!group) throw error;
    }
  }
  await directory.addGroupMember({ groupEmail: email, memberEmail: APP_GROUP_OWNER, role: 'OWNER', memberType: 'USER' });
  await directory.addGroupMember({ groupEmail: email, memberEmail: APP_GROUP_MANAGER, role: 'MANAGER', memberType: 'USER' });
  return { group };
}
