#!/usr/bin/env node
/**
 * Verify migration 482 (kudos approval_status) was applied correctly.
 * Run from project root: node database/verify-482-kudos-approval.js
 */

import pool from '../backend/src/config/database.js';

async function verify() {
  console.log('Verifying migration 482_kudos_approval_status...\n');

  try {
    // 1. Check if approval_status column exists
    const [colRows] = await pool.execute(`
      SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'kudos'
        AND COLUMN_NAME = 'approval_status'
    `);

    if (colRows.length === 0) {
      console.log('❌ approval_status column: NOT FOUND');
      console.log('   Migration 482 was not applied (or ran before the column was added).');
      console.log('   Fix: Unlog and re-run: node database/run-migrations.js --unlog=482');
      return;
    }

    const col = colRows[0];
    console.log('✅ approval_status column: EXISTS');
    console.log(`   Type: ${col.COLUMN_TYPE}`);
    console.log(`   Default: ${col.COLUMN_DEFAULT}`);
    console.log(`   Nullable: ${col.IS_NULLABLE}`);

    const expectedEnum = "enum('pending','approved','rejected')";
    if (!String(col.COLUMN_TYPE).toLowerCase().includes('enum')) {
      console.log(`   ⚠️  Expected ENUM type, got: ${col.COLUMN_TYPE}`);
    }

    // 2. Check if index exists
    const [idxRows] = await pool.execute(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'kudos'
        AND INDEX_NAME = 'idx_kudos_approval_agency'
    `);

    if (idxRows.length === 0) {
      console.log('\n⚠️  Index idx_kudos_approval_agency: NOT FOUND');
      console.log('   You can add it manually:');
      console.log('   CREATE INDEX idx_kudos_approval_agency ON kudos (agency_id, approval_status);');
    } else {
      console.log('\n✅ Index idx_kudos_approval_agency: EXISTS');
    }

    // 3. Check data distribution
    const [distRows] = await pool.execute(`
      SELECT approval_status, COUNT(*) AS cnt
      FROM kudos
      GROUP BY approval_status
    `);

    console.log('\nData distribution:');
    if (distRows.length === 0) {
      console.log('   (No kudos rows yet)');
    } else {
      distRows.forEach((r) => {
        console.log(`   ${r.approval_status}: ${r.cnt}`);
      });
      const pending = distRows.find((r) => r.approval_status === 'pending')?.cnt || 0;
      const approved = distRows.find((r) => r.approval_status === 'approved')?.cnt || 0;
      const rejected = distRows.find((r) => r.approval_status === 'rejected')?.cnt || 0;
      if (approved === 0 && (pending + rejected) > 0) {
        console.log('\n   ⚠️  Existing peer/notes_complete kudos may need backfill:');
        console.log('   UPDATE kudos SET approval_status = \'approved\' WHERE source = \'notes_complete\';');
        console.log('   UPDATE kudos SET approval_status = \'approved\' WHERE source = \'peer\';');
      }
    }

    // 4. Check migrations_log for 482
    const [logRows] = await pool.execute(`
      SELECT migration_name, executed_at, success, error_message
      FROM migrations_log
      WHERE migration_name LIKE '482%'
      ORDER BY executed_at DESC
      LIMIT 1
    `);

    console.log('\nMigrations log:');
    if (logRows.length === 0) {
      console.log('   482 not in migrations_log (may have been run manually)');
    } else {
      const log = logRows[0];
      console.log(`   ${log.migration_name}: ${log.success ? '✅ success' : '❌ failed'}`);
      console.log(`   Executed: ${log.executed_at}`);
      if (log.error_message) console.log(`   Error: ${log.error_message}`);
    }

    console.log('\n--- Verification complete ---');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

verify();
