/**
 * Read-only by default. Example scheduled Cloud Run Job command:
 * node src/scripts/runAssistantMaintenance.js --apply
 *
 * Schedule every 15 minutes. This checks scope/group drift, restricts drifted
 * accounts, retries durable account-change alerts and advances preparation jobs.
 * It never starts an external bot, grants privileges or invokes a language model.
 * No Cloud Run Job or Cloud Scheduler schedule is created by this script.
 */
import { pathToFileURL } from 'node:url';
import pool from '../config/database.js';
import { runAssistantMaintenance } from '../services/assistantMaintenance.service.js';
export function parseAssistantMaintenanceArguments(args) {
  if (args.some(arg => !['--apply', '--check-only', '--help'].includes(arg)) || (args.includes('--apply') && args.includes('--check-only'))) throw new Error('Use --check-only (default), --apply, or --help');
  return { help: args.includes('--help'), apply: args.includes('--apply') };
}
export async function main(args = process.argv.slice(2), { run = runAssistantMaintenance, db = pool, output = console.log } = {}) {
  try {
    const options = parseAssistantMaintenanceArguments(args);
    if (options.help) { output('Assistant maintenance: --check-only inspects without changes; --apply restricts drifted accounts and processes existing alert/preparation queues.'); return 0; }
    const result = await run({ apply: options.apply, db });
    // Count-only report: identities, credentials, packets and directory errors stay private.
    output(JSON.stringify(result));
    return result.drifted || result.unavailable || result.deferred ? 2 : 0;
  } catch { output(JSON.stringify({ status: 'blocked', reasonCode: 'ASSISTANT_MAINTENANCE_FAILED' })); return 1; }
  finally { await db.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
