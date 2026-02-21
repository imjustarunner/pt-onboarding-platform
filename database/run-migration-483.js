#!/usr/bin/env node
/**
 * Standalone runner for migration 483 (office_availability_request_slots room_id).
 * Run with: node database/run-migration-483.js
 *
 * Does not use migrations_log. Safe to run multiple times (ADD COLUMN is idempotent
 * if column already exists with --ignore or equivalent; MySQL will error on duplicate
 * column - catch and ignore).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../backend/src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const sqlPath = path.join(__dirname, 'migrations', '483_office_availability_request_slots_room_id.sql');
  const sql = await fs.readFile(sqlPath, 'utf-8');

  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--') && !line.trimStart().startsWith('#'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log('Running migration 483: office_availability_request_slots_room_id');
  for (const stmt of statements) {
    try {
      await pool.execute(stmt);
      console.log('  ✓ Success');
    } catch (e) {
      if (e?.code === 'ER_DUP_FIELDNAME' || e?.errno === 1060 || String(e?.message || '').includes('Duplicate column')) {
        console.log('  ⚠️  Column room_id already exists, skipping');
      } else if (e?.code === 'ER_DUP_KEYNAME' || e?.errno === 1061) {
        console.log('  ⚠️  Index already exists, skipping');
      } else {
        throw e;
      }
    }
  }
  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
