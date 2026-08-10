#!/usr/bin/env node
/**
 * DEPRECATED SHIM — do not implement a second migrator here.
 *
 * The previous contents of this file re-ran every migration SQL without checking
 * migrations_log, which collapsed users.role back to the ancient clinician-default
 * ENUM on a live database.
 *
 * Canonical runner (also used by `npm run migrate`):
 *   database/run-migrations.js
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAFE_RUNNER = path.resolve(__dirname, '../../../database/run-migrations.js');

function translateArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = String(argv[i] || '');
    if (a === '--only' || a === '--migration') {
      const v = argv[i + 1];
      if (v && !String(v).startsWith('--')) {
        out.push(`--migration=${String(v).trim()}`);
        i += 1;
      }
      continue;
    }
    if (a.startsWith('--only=')) {
      out.push(`--migration=${a.slice('--only='.length).trim()}`);
      continue;
    }
    // --collect-errors has no equivalent; drop it rather than invent behavior.
    if (a === '--collect-errors') continue;
    // --from has no equivalent on the safe runner; refuse rather than replay a range.
    if (a === '--from' || a.startsWith('--from=')) {
      console.error(
        'Refusing --from: use `npm run migrate` (pending only) or ' +
          '`npm run migrate -- --migration=N` for a single file.'
      );
      process.exit(1);
    }
    out.push(a);
  }
  return out;
}

console.warn(
  '[deprecated] backend/src/scripts/runMigrations.js is a shim.\n' +
    '            Use: cd backend && npm run migrate\n' +
    '            Delegating to database/run-migrations.js …\n'
);

const child = spawn(process.execPath, [SAFE_RUNNER, ...translateArgs(process.argv.slice(2))], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code == null ? 1 : code);
});
