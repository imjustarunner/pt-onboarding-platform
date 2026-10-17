import Directory from '../services/googleWorkspaceDirectory.service.js';
import { convertPortalAliasToGroup } from '../services/portalGroupMigration.service.js';
import { ensureSendAsAlias } from '../services/gmailSendAs.service.js';
import pool from '../config/database.js';
const value = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const address = value('address'), displayName = value('name');
try {
  if (!address || !displayName) throw new Error('Usage: --address=sender@domain --name="Sender name" [--expected-owner=mailbox@domain] [--apply]');
  const apply = process.argv.includes('--apply');
  const result = await convertPortalAliasToGroup({ address, displayName, directory: Directory, apply, expectedOwner: value('expected-owner') });
  console.log(JSON.stringify(result));
  if (apply) {
    const sending = await ensureSendAsAlias({ sendAsEmail: address, displayName, treatAsAlias: false });
    if (!sending.ok || sending.sendAs?.verificationStatus !== 'accepted') throw new Error('Group exists but sending permission is not yet verified.');
    console.log(JSON.stringify({ address, sending: 'verified_group', testEmailSent: false }));
  }
} catch (error) {
  console.error(JSON.stringify({ address, code: error.code || 'PORTAL_CONVERSION_ERROR', message: error.message, causeCode: error.cause?.code }));
  process.exitCode = 1;
} finally { await pool.end(); }
