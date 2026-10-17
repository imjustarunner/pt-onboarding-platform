import dotenv from 'dotenv';
if (process.env.ENROLLMENT_ENV_FILE) dotenv.config({ path: process.env.ENROLLMENT_ENV_FILE, quiet: true });
const { default: Directory } = await import('../services/googleWorkspaceDirectory.service.js');
const { ensureSendAsAlias, listSendAsAliases } = await import('../services/gmailSendAs.service.js');
const { ensurePortalDeliveryGroup } = await import('../services/portalGroupSender.service.js');
const { APP_EMAIL_TRANSPORT } = await import('../services/unifiedEmail/transportMailbox.js');
const apply = process.argv.includes('--apply');
const targets = [
  { email: 'portal@auricwell.com', name: 'AuricWell Portal', reply: 'support@auricwell.com' },
  { email: 'portal@nextleveluplcc.com', name: 'Next Level Up Portal', reply: 'support@nextleveluplcc.com' }
];
try {
  const directory = await Directory.getClient();
  const directoryOnly = process.argv.includes('--directory-only');
  const aliases = directoryOnly ? [] : await listSendAsAliases({ impersonateUser: APP_EMAIL_TRANSPORT });
  for (const target of targets) {
    let group = null;
    try { group = (await directory.groups.get({ groupKey: target.email })).data; }
    catch (e) {
      if (Number(e.code) !== 404 && Number(e.code) !== 403) throw e;
      const account = await Directory.getUser({ primaryEmail: target.email });
      if (account) throw new Error(`${target.email} is a user account or alias; migrate the alias explicitly before provisioning.`);
      if (Number(e.code) === 403) throw e;
    }
    if (apply) group = await ensurePortalDeliveryGroup({ address: target.email, displayName: target.name });
    const sendAs = apply && !directoryOnly ? await ensureSendAsAlias({ impersonateUser: APP_EMAIL_TRANSPORT, sendAsEmail: target.email, displayName: target.name, replyToAddress: target.reply }) : null;
    console.log(JSON.stringify({ email: target.email, mailbox: group ? 'group' : 'missing', verifiedSender: sendAs?.sendAs?.verificationStatus || aliases.find(a => a.sendAsEmail === target.email)?.verificationStatus || 'missing', error: sendAs?.error || null }));
  }
} catch(e) { console.error(JSON.stringify({ error: String(e.message), code: e.code || null })); process.exitCode = 1; }

const { default: pool } = await import('../config/database.js');
await pool.end();
