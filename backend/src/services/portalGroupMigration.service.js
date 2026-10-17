import { APP_GROUP_OWNER } from './appGroupOwnership.service.js';
import { APP_EMAIL_TRANSPORT } from './unifiedEmail/transportMailbox.js';
import { PORTAL_GROUP_DESCRIPTION, PORTAL_GROUP_SETTINGS } from './portalGroupSender.service.js';

/** Stage and secure a group before moving its address. Only explicit aliases on
 * the shared application mailbox may be converted; staff aliases and primary accounts are excluded.
 * Restore the original alias if Google cannot complete the address handoff.
 */
export async function convertPortalAliasToGroup({ address, displayName, directory, apply = false, suffix = Date.now(), retryDelayMs = 10000, retryAttempts = 12 }) {
  const email = String(address || '').trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) throw new Error('A valid sender address is required.');
  const retryHandoff = async operation => {
    for (let attempt = 0; ; attempt++) {
      try { return await operation(); }
      catch (error) {
        if (Number(error.code || error.response?.status) !== 409 || attempt >= retryAttempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
  };
  let owner;
  try { owner = await directory.getUser({ primaryEmail: email }); }
  catch (error) {
    if (Number(error.code || error.response?.status) !== 400) throw error;
    const existing = await directory.getGroup({ groupEmail: email, strictNotFound: true });
    if (existing) return { address: email, state: 'already_group', groupId: existing.id };
    throw error;
  }
  if (!owner) {
    const existing = await directory.getGroup({ groupEmail: email, strictNotFound: true });
    if (existing) return { address: email, state: 'already_group', groupId: existing.id };
    throw new Error('No existing sender alias found. Use group provisioning for a new address.');
  }
  if (owner.primaryEmail !== APP_EMAIL_TRANSPORT || !(owner.aliases || []).includes(email)) {
    throw new Error('Only an explicit alias of the shared application mailbox can be converted. Staff aliases must remain on their own accounts.');
  }
  if (!apply) return { address: email, state: 'ready_to_convert', source: owner.primaryEmail, deliveryMember: APP_EMAIL_TRANSPORT };
  const admin = await directory.getClient();
  const stagingAddress = `app-transition-${suffix}@${email.split('@')[1]}`;
  const group = await directory.createGroup({ email: stagingAddress, name: displayName, description: PORTAL_GROUP_DESCRIPTION, ...PORTAL_GROUP_SETTINGS });
  let renameAccepted = false;
  let aliasRemoved = false;
  let deletionAttempted = false;
  try {
    await directory.applyGroupAccessSettings({ groupEmail: stagingAddress, ...PORTAL_GROUP_SETTINGS });
    await directory.addGroupMember({ groupEmail: stagingAddress, memberEmail: APP_EMAIL_TRANSPORT, role: 'MANAGER', memberType: 'USER' });
    await directory.addGroupMember({ groupEmail: stagingAddress, memberEmail: APP_GROUP_OWNER, role: 'OWNER', memberType: 'USER' });
    deletionAttempted = true;
    await admin.users.aliases.delete({ userKey: owner.id, alias: email });
    aliasRemoved = true;
    await retryHandoff(async () => {
      try {
        await admin.groups.update({ groupKey: group.id, requestBody: { email, name: displayName } });
        renameAccepted = true;
      } catch (error) {
        const target = await admin.groups.get({ groupKey: email }).then(r => r.data).catch(() => null);
        if (target?.id === group.id && target?.email === email) { renameAccepted = true; return; }
        throw error;
      }
    });
    // Google can briefly return the old address by group ID after accepting a rename.
    // A successful rename must never trigger alias restoration based on that stale read.
    let verified;
    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      verified = await admin.groups.get({ groupKey: email }).then(r => r.data).catch(() => null);
      if (verified?.email === email) break;
      if (attempt < retryAttempts - 1) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
    if (verified?.email !== email) throw new Error('Google accepted the group address; verification is still propagating.');
    return { address: email, state: 'converted', groupId: group.id, deliveryMember: APP_EMAIL_TRANSPORT };
  } catch (error) {
    if (renameAccepted) throw Object.assign(new Error('Group address renamed; verification is pending. Do not restore the user alias.'), { code: 'GROUP_VERIFICATION_PENDING', groupId: group.id, cause: error });
    // An API timeout can follow a successful rename. Check before restoring.
    const current = await admin.groups.get({ groupKey: group.id }).then(r => r.data).catch(() => null);
    if (current?.email === email) return { address: email, state: 'converted', groupId: group.id, deliveryMember: APP_EMAIL_TRANSPORT };
    if (deletionAttempted && !aliasRemoved) {
      // A delete timeout may still have released the address. Verify before cleanup.
      const remaining = await directory.getUser({ primaryEmail: email });
      if (remaining && remaining.id !== owner.id) throw new Error('Sender address ownership changed during conversion; administrator review required.');
      aliasRemoved = !remaining;
    }
    if (aliasRemoved) {
      try { await retryHandoff(() => admin.users.aliases.insert({ userKey: owner.id, requestBody: { alias: email } })); }
      catch (restoreError) { throw Object.assign(new Error('Portal handoff failed and alias restoration requires administrator attention.'), { code: 'PORTAL_ALIAS_RESTORE_FAILED', cause: restoreError }); }
    }
    // Delete only our still-staged group after the original address is safe.
    if (current?.email === stagingAddress) await admin.groups.delete({ groupKey: group.id }).catch(() => {});
    throw Object.assign(new Error('Portal group conversion failed; the original alias is retained or restored.'), { code: 'PORTAL_GROUP_CONVERSION_FAILED', cause: error });
  }
}
