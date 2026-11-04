import { normalizeRelayAddress, relayConfiguration, relayError } from './workspaceRelayConfig.js';

/** Transport verification supplements the existing tenant/staff send permission.
 * Relay never grants a user permission to choose an arbitrary From address. */
export async function verifyWorkspaceRelaySender(address, { env = process.env, directory, db } = {}) {
  const from = normalizeRelayAddress(address);
  const { domains } = relayConfiguration(env);
  if (!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(from) || from.startsWith('ai@') || !domains.includes(from.split('@')[1])) {
    throw relayError('EMAIL_SENDER_FORBIDDEN', 'The Workspace relay sender is not permitted.');
  }
  directory ||= (await import('./googleWorkspaceDirectory.service.js')).default;
  db ||= (await import('../config/database.js')).default;
  const [identities] = await db.execute('SELECT id FROM email_sender_identities WHERE LOWER(from_email)=? AND is_active=1 LIMIT 1', [from]);
  if (!identities.length) throw relayError('EMAIL_SENDER_UNVERIFIED', 'Register an active app sender before enabling Workspace relay.');
  const group = await directory.getGroup({ groupEmail: from, strictNotFound: true });
  if (!group?.id || ![group.email, ...(group.aliases || [])].some(a => normalizeRelayAddress(a) === from)) {
    throw relayError('EMAIL_SENDER_UNVERIFIED', 'Workspace relay requires the verified sender Group.');
  }
  const members = await directory.listGroupMembers(from, { maxResults: 5000 });
  if (!members.some(m => normalizeRelayAddress(m.email) === 'ai@plottwistco.com' && m.type === 'USER' && (!m.status || m.status === 'ACTIVE'))) {
    throw relayError('EMAIL_SENDER_UNVERIFIED', 'The app transport must remain an active member of the sender Group for replies.');
  }
  return { transport: 'workspace_smtp_relay', groupId: group.id };
}
