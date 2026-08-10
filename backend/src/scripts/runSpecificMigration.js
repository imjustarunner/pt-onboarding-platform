#!/usr/bin/env node
/**
 * DEPRECATED SHIM — do not execute raw migration SQL from here.
 * Delegates to database/run-migrations.js (same as `npm run migrate -- --migration=N`).
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFE_RUNNER = path.resolve(__dirname, '../../../database/run-migrations.js');

const filename = process.argv[2];
if (!filename) {
  console.error('Usage: node src/scripts/runSpecificMigration.js <migration.sql|N>');
  process.exit(1);
}

const needle = String(filename).replace(/\.sql$/i, '');
console.warn(
  '[deprecated] runSpecificMigration.js is a shim — use `npm run migrate -- --migration=' +
    needle +
    '`\n'
);

const child = spawn(
  process.execPath,
  [SAFE_RUNNER, `--migration=${needle}`],
  { stdio: 'inherit', env: process.env }
);
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code == null ? 1 : code);
});
