#!/usr/bin/env node
/**
 * DEPRECATED SHIM — do not execute raw migration SQL from here.
 * Runs each file through database/run-migrations.js so migrations_log is respected.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFE_RUNNER = path.resolve(__dirname, '../../../database/run-migrations.js');

const migrations = process.argv.slice(2);
if (migrations.length === 0) {
  console.error('Usage: node src/scripts/runSpecificMigrations.js <migration.sql|N> [...]');
  process.exit(1);
}

console.warn(
  '[deprecated] runSpecificMigrations.js is a shim — prefer `npm run migrate` for pending only.\n'
);

function runOne(spec) {
  const needle = String(spec).replace(/\.sql$/i, '');
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [SAFE_RUNNER, `--migration=${needle}`],
      { stdio: 'inherit', env: process.env }
    );
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`killed by ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`migration ${needle} exited ${code}`));
    });
  });
}

for (const spec of migrations) {
  try {
    await runOne(spec);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
