#!/usr/bin/env node
/**
 * Migration Runner Script
 * 
 * This script runs database migrations in order.
 * It tracks which migrations have been run in a migrations_log table.
 * 
 * Usage:
 *   node database/run-migrations.js [--dry-run] [--migration N] [--baseline-existing]
 * 
 * Options:
 *   --dry-run: Show what would be run without executing
 *   --migration N: Run only migration N (e.g., --migration=091)
 *   --baseline-existing: Mark all current migration files as already run (safe bootstrap for legacy DBs)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../backend/src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Create migrations log table if it doesn't exist
async function ensureMigrationsTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS migrations_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      execution_time_ms INT,
      success BOOLEAN DEFAULT TRUE,
      error_message TEXT,
      INDEX idx_migration_name (migration_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// Get list of migration files sorted by number
async function getMigrationFiles() {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter(file => file.endsWith('.sql'))
    // Exclude consolidated/fresh snapshot files from normal migration flow.
    .filter(file => file !== '000_consolidated_fresh_database.sql')
    .sort((a, b) => {
      // Extract number from filename (e.g., "091_add_username_field.sql" -> 91)
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
      if (numA !== numB) return numA - numB;
      // Tie-break by full filename so duplicate prefixes run deterministically.
      return a.localeCompare(b);
    });
}

async function getAppliedMigrationCount() {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM migrations_log WHERE success = 1'
  );
  return Number(rows?.[0]?.cnt || 0);
}

async function hasExistingAppSchema() {
  const [rows] = await pool.execute(`
    SELECT COUNT(*) AS cnt
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('users', 'agencies', 'organizations')
  `);
  return Number(rows?.[0]?.cnt || 0) > 0;
}

// Check if migration has been run
async function hasMigrationRun(migrationName) {
  const [rows] = await pool.execute(
    'SELECT success FROM migrations_log WHERE migration_name = ?',
    [migrationName]
  );
  return rows.length > 0 && rows[0].success === 1;
}

// Record migration execution
async function recordMigration(migrationName, success, executionTime, errorMessage = null) {
  await pool.execute(
    `INSERT INTO migrations_log (migration_name, execution_time_ms, success, error_message)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       executed_at = CURRENT_TIMESTAMP,
       execution_time_ms = ?,
       success = ?,
       error_message = ?`,
    [migrationName, executionTime, success, errorMessage, executionTime, success, errorMessage]
  );
}

// Run a single migration
async function runMigration(migrationFile, dryRun = false) {
  const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
  const migrationName = path.basename(migrationFile, '.sql');
  const sql = await fs.readFile(migrationPath, 'utf-8');
  
  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Running migration: ${migrationName}`);
  console.log(`  File: ${migrationFile}`);
  console.log(`  Statements: ${statements.length}`);
  
  if (dryRun) {
    console.log(`  SQL preview (first 200 chars): ${sql.substring(0, 200)}...`);
    return { success: true, executionTime: 0 };
  }
  
  const startTime = Date.now();
  let error = null;
  
  const isIgnorableSchemaError = (err) => {
    const code = String(err?.code || '');
    const errno = Number(err?.errno || 0);
    const msg = String(err?.message || '');
    // Common idempotency / "already exists" schema errors
    return (
      code === 'ER_DUP_FIELDNAME' || errno === 1060 || msg.includes('Duplicate column name') ||
      code === 'ER_DUP_KEYNAME' || errno === 1061 || msg.includes('Duplicate key name') ||
      code === 'ER_DUP_ENTRY' || errno === 1062 ||
      // MySQL: can't create table / already exists (should be rare if IF NOT EXISTS used)
      code === 'ER_TABLE_EXISTS_ERROR' || errno === 1050 || msg.includes('already exists')
    );
  };

  try {
    // Execute each statement
    for (const statement of statements) {
      const s = statement.trim();
      if (!s) continue;
      try {
        await pool.execute(s);
      } catch (err) {
        if (isIgnorableSchemaError(err)) {
          console.log(`  ⚠️  Skipping statement (already applied): ${String(err?.message || err)}`);
          continue;
        }
        throw err;
      }
    }
    
    const executionTime = Date.now() - startTime;
    await recordMigration(migrationName, true, executionTime);
    console.log(`  ✓ Success (${executionTime}ms)`);
    return { success: true, executionTime };
  } catch (err) {
    const executionTime = Date.now() - startTime;
    error = err.message;
    await recordMigration(migrationName, false, executionTime, error);
    console.error(`  ✗ Failed: ${error}`);
    return { success: false, executionTime, error };
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const baselineExisting = args.includes('--baseline-existing');
  const migrationArg = args.find(arg => arg.startsWith('--migration'));
  const specificMigration = migrationArg ? migrationArg.split('=')[1] : null;
  
  try {
    console.log('Database Migration Runner');
    console.log('========================');
    console.log(`Database: ${process.env.DB_NAME || 'onboarding_stage'}`);
    console.log(`Dry run: ${dryRun ? 'YES' : 'NO'}`);
    if (specificMigration) {
      console.log(`Specific migration: ${specificMigration}`);
    }
    if (baselineExisting) {
      console.log('Baseline existing: YES');
    }
    console.log('');
    
    await ensureMigrationsTable();
    
    const migrationFiles = await getMigrationFiles();
    console.log(`Found ${migrationFiles.length} migration files`);

    // Explicit bootstrap mode: mark files as applied without executing SQL.
    // Use this once for legacy databases that existed before migrations_log tracking.
    if (!dryRun && !specificMigration && baselineExisting) {
      console.log('Bootstrapping migrations_log for existing database (no SQL execution)...');
      for (const migrationFile of migrationFiles) {
        const migrationName = path.basename(migrationFile, '.sql');
        await recordMigration(migrationName, true, 0, null);
      }
      console.log(`✓ Baseline complete (${migrationFiles.length} migrations marked as applied)\n`);
      process.exit(0);
    }

    // Safety guard: if this is an existing DB but migration log is empty, do not replay
    // all historical migrations unless user explicitly requested baseline bootstrapping.
    if (!dryRun && !specificMigration) {
      const appliedCount = await getAppliedMigrationCount();
      const existingSchema = await hasExistingAppSchema();
      if (appliedCount === 0 && existingSchema && !baselineExisting) {
        console.error('\nSafety stop: existing schema detected but migrations_log is empty.');
        console.error('Running all migrations from the beginning could replay legacy data migrations.');
        console.error('If this DB is already in use, run with --baseline-existing once, then run migrate again.\n');
        process.exit(1);
      }
    }
    
    if (specificMigration) {
      // Run only specific migration
      const migrationFile = migrationFiles.find(f => f.startsWith(specificMigration));
      if (!migrationFile) {
        console.error(`Migration ${specificMigration} not found`);
        process.exit(1);
      }
      const migrationName = path.basename(migrationFile, '.sql');
      if (!dryRun && await hasMigrationRun(migrationName)) {
        console.log(`Migration ${migrationName} has already been run. Use --force to re-run.`);
        process.exit(0);
      }
      const result = await runMigration(migrationFile, dryRun);
      process.exit(result.success ? 0 : 1);
    } else {
      // Run all pending migrations
      const results = [];
      for (const migrationFile of migrationFiles) {
        const migrationName = path.basename(migrationFile, '.sql');
        if (!dryRun && await hasMigrationRun(migrationName)) {
          console.log(`⏭  Skipping ${migrationName} (already run)`);
          continue;
        }
        const result = await runMigration(migrationFile, dryRun);
        results.push({ migration: migrationName, ...result });
        if (!result.success && !dryRun) {
          console.error(`\nMigration failed. Stopping.`);
          break;
        }
      }
      
      const summary = {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      };
      
      console.log('\n========================');
      console.log('Migration Summary');
      console.log('========================');
      console.log(`Total: ${summary.total}`);
      console.log(`Successful: ${summary.successful}`);
      console.log(`Failed: ${summary.failed}`);
      
      process.exit(summary.failed > 0 ? 1 : 0);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
