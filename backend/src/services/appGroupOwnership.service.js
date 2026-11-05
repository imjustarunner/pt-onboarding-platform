export const APP_GROUP_OWNER = 'michael@plottwistco.com';
export const APP_GROUP_MANAGER = 'ai@plottwistco.com';
// Departmental correspondence is handled in app tickets, including for owners.
const OWNER_MAIL_GROUPS = new Set(['clinical', 'staff']);

export function appGroupMemberPolicy(address, groupAddress = '') {
  const email = String(address || '').trim().toLowerCase();
  const group = String(groupAddress || '').trim().toLowerCase();
  const receivesMail = /^[^@\s]+@[^@\s]+$/.test(group) && OWNER_MAIL_GROUPS.has(group.split('@')[0]);
  if (email === APP_GROUP_OWNER) return { email, role: 'OWNER', delivery_settings: receivesMail ? 'ALL_MAIL' : 'NONE' };
  if (email === APP_GROUP_MANAGER) return { email, role: 'MANAGER', delivery_settings: 'ALL_MAIL' };
  return null;
}

// Set subscriptions with membership so provisioning and later synchronization
// preserve the owner's requested operational mail across organization domains.
export async function ensureAppGroupMember({ admin, groupKey, email }) {
  const policy = appGroupMemberPolicy(email, groupKey);
  if (!policy) throw new Error('This account is not an application group administrator.');
  let current;
  try { current = (await admin.members.get({ groupKey, memberKey: policy.email })).data; }
  catch (error) { if (Number(error.code || error.response?.status) !== 404) throw error; }
  if (!current) {
    try { await admin.members.insert({ groupKey, requestBody: policy }); }
    catch (error) { if (Number(error.code || error.response?.status) !== 409) throw error; }
  }
  if (current?.role !== policy.role || current?.delivery_settings !== policy.delivery_settings) {
    await admin.members.update({ groupKey, memberKey: policy.email, requestBody: policy });
  }
  const { data: verified } = await admin.members.get({ groupKey, memberKey: policy.email });
  if (verified.role !== policy.role || verified.delivery_settings !== policy.delivery_settings) {
    throw new Error('Application group ownership and subscription settings did not verify.');
  }
  return verified;
}
export async function ensureAppGroupOwnership({ admin, groupKey }) {
  await ensureAppGroupMember({ admin, groupKey, email: APP_GROUP_OWNER });
  await ensureAppGroupMember({ admin, groupKey, email: APP_GROUP_MANAGER });
}
