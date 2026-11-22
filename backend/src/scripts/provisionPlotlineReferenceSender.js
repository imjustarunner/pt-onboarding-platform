import pool from '../config/database.js';
import Identity from '../models/EmailSenderIdentity.model.js';
import { ensureWorkspaceSenderGroup } from '../services/workspaceSenderGroup.service.js';
import { ensureSendAsAlias } from '../services/gmailSendAs.service.js';
import { relaySelected } from '../services/workspaceRelayConfig.js';
import { assertVerifiedGmailSender } from '../services/unifiedEmail/verifiedSender.js';
import { getGmailClient } from '../services/unifiedEmail/gmailClient.js';

const address = 'references@plotlinepo.com';
const agencyIds = [463, 464];
const apply = process.argv.includes('--apply');

try {
  const [agencies] = await pool.execute('SELECT id, name, hiring_reference_sender_identity_id FROM agencies WHERE id IN (?, ?) AND is_demo = 1', agencyIds);
  if (agencies.length !== agencyIds.length) throw new Error('The two expected QA companies must exist as demo companies.');
  const existing = [];
  for (const agency of agencies) {
    const configured = agency.hiring_reference_sender_identity_id ? await Identity.findById(agency.hiring_reference_sender_identity_id) : null;
    if (configured && configured.from_email?.toLowerCase() !== address) throw new Error('A QA company has a pinned reference sender. Review its replacement first.');
    const identity = await Identity.findByAgencyAndIdentityKey(agency.id, 'hiring_references', { includeInactive: true });
    if (identity && identity.from_email?.toLowerCase() !== address) throw new Error('A QA company already has a different reference sender. Review that configuration before replacing it.');
    existing.push({ agencyId: agency.id, identityId: identity?.id || null });
  }
  console.log(JSON.stringify({ address, companies: existing, apply }));
  if (apply) {
    const result = await ensureWorkspaceSenderGroup({ email: address, displayName: 'Plotline References' });
    if (!result.group?.id) throw new Error('The reference address must be a dedicated Workspace group.');
    if (!relaySelected(address)) {
      const alias = await ensureSendAsAlias({ sendAsEmail: address, displayName: 'Plotline References', replyToAddress: address });
      if (!alias.ok) throw new Error('Workspace did not accept the reference send-as setup.');
    }
    await assertVerifiedGmailSender(await getGmailClient(), address);
    for (const agencyId of agencyIds) {
      let identity = await Identity.findByAgencyAndIdentityKey(agencyId, 'hiring_references', { includeInactive: true });
      const fields = { displayName: 'Plotline References', replyTo: address, isActive: true };
      identity = identity
        ? await Identity.update(identity.id, fields)
        : await Identity.create({ agencyId, identityKey: 'hiring_references', fromEmail: address, ...fields });
      await pool.execute('UPDATE agencies SET hiring_reference_sender_identity_id = ? WHERE id = ? AND is_demo = 1', [identity.id, agencyId]);
      console.log(JSON.stringify({ agencyId, identityId: identity.id, senderVerified: true }));
    }
  }
} catch (error) {
  console.error(JSON.stringify({ error: error.message, code: error.code || null }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
