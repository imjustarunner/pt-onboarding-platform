#!/usr/bin/env node
/**
 * CLI: import a Google Takeout .mbox into a user's personal Communications inbox.
 *
 * Usage:
 *   node src/scripts/importMboxToPersonalInbox.js \
 *     --agencyId=2 --userId=501 --file="/path/to/All mail.mbox"
 *
 * Options:
 *   --dryRun=1          Parse + report only
 *   --skipSpamTrash=0   Include spam/trash (default skips)
 *   --maxMessages=100   Cap for testing
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { importMboxToPersonalInbox } from '../services/mboxImport.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback = null) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (!hit) return fallback;
  return hit.slice(pref.length);
}

function flag(name) {
  return process.argv.includes(`--${name}`) || arg(name) === '1' || arg(name) === 'true';
}

async function main() {
  const agencyId = Number(arg('agencyId'));
  const userId = Number(arg('userId'));
  const file = arg('file');
  const dryRun = flag('dryRun');
  const skipSpamTrash = arg('skipSpamTrash') == null ? true : !['0', 'false', 'no'].includes(String(arg('skipSpamTrash')).toLowerCase());
  const maxMessages = arg('maxMessages') != null ? Number(arg('maxMessages')) : null;

  if (!agencyId || !userId || !file) {
    console.error('Required: --agencyId= --userId= --file=');
    process.exit(1);
  }

  const filePath = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  console.log('Importing mbox…', { agencyId, userId, filePath, dryRun, skipSpamTrash, maxMessages });

  const result = await importMboxToPersonalInbox({
    agencyId,
    userId,
    filePath,
    dryRun,
    skipSpamTrash,
    maxMessages,
    onProgress: (s) => {
      process.stdout.write(`\r scanned=${s.scanned} imported=${s.importedMessages} skippedDup=${s.skippedDuplicate}   `);
    }
  });

  console.log('\nDone.');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
