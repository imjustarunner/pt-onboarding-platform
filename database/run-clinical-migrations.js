#!/usr/bin/env node
/**
 * Clinical database migration runner.
 *
 * Runs SQL files from database/clinical_migrations/ against the clinical DB
 * connection (CLINICAL_DB_* env vars, falling back to main DB credentials).
 *
 * Usage:
 *   node database/run-clinical-migrations.js [--dry-run] [--migration N] [--baseline-existing] [--unlog N]
 *
 * Options:
 *   --dry-run: Show what would be run without executing
 *   --migration N: Run only migration N (e.g., --migration=002)
 *   --baseline-existing: Mark all current migration files as already run (legacy DB bootstrap)
 *   --unlog N: Remove migration N from clinical_migrations_log so it can be run again
 *   --force: With --migration N, run even if logged as successful
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import clinicalPool from '../backend/src/config/clinicalDatabase.js';
import {
  isIgnorableSchemaError,
  splitSqlStatements,
  stripSqlLineComments
} from './migrationSqlUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'clinical_migrations');
const MIGRATIONS_LOG_TABLE = 'clinical_migrations_log';

function resolveClinicalDbLabel() {
  return process.env.CLINICAL_DB_NAME || process.env.DB_NAME || 'onboarding_stage_clinical';
}

async function ensureMigrationsTable() {
  await clinicalPool.execute(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_LOG_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      execution_time_ms INT,
      success BOOLEAN DEFAULT TRUE,
      error_message TEXT,
      INDEX idx_clinical_migration_name (migration_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function getMigrationFiles() {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0', 10);
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });
}

async function getAppliedMigrationCount() {
  const [rows] = await clinicalPool.execute(
    `SELECT COUNT(*) AS cnt FROM ${MIGRATIONS_LOG_TABLE} WHERE success = 1`
  );
  return Number(rows?.[0]?.cnt || 0);
}

async function hasExistingClinicalSchema() {
  const [rows] = await clinicalPool.execute(`
    SELECT COUNT(*) AS cnt
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('clinical_sessions', 'clinical_notes')
  `);
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function unlogMigration(migrationSpec) {
  const migrationFiles = await getMigrationFiles();
  const match = migrationFiles.find(
    (f) => f.startsWith(migrationSpec) || path.basename(f, '.sql') === migrationSpec
  );
  if (!match) {
    throw new Error(`Clinical migration not found: ${migrationSpec}`);
  }
  const migrationName = path.basename(match, '.sql');
  const [result] = await clinicalPool.execute(
    `DELETE FROM ${MIGRATIONS_LOG_TABLE} WHERE migration_name = ?`,
    [migrationName]
  );
  return { migrationName, deleted: result.affectedRows };
}

async function hasMigrationRun(migrationName) {
  const [rows] = await clinicalPool.execute(
    `SELECT success FROM ${MIGRATIONS_LOG_TABLE} WHERE migration_name = ?`,
    [migrationName]
  );
  return rows.length > 0 && rows[0].success === 1;
}

async function recordMigration(migrationName, success, executionTime, errorMessage = null) {
  await clinicalPool.execute(
    `INSERT INTO ${MIGRATIONS_LOG_TABLE} (migration_name, execution_time_ms, success, error_message)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       executed_at = CURRENT_TIMESTAMP,
       execution_time_ms = ?,
       success = ?,
       error_message = ?`,
    [migrationName, executionTime, success, errorMessage, executionTime, success, errorMessage]
  );
}

async function runMigration(migrationFile, dryRun = false) {
  const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
  const migrationName = path.basename(migrationFile, '.sql');
  const sql = await fs.readFile(migrationPath, 'utf-8');
  const statements = splitSqlStatements(stripSqlLineComments(sql));

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Running clinical migration: ${migrationName}`);
  console.log(`  File: ${migrationFile}`);
  console.log(`  Statements: ${statements.length}`);

  if (statements.length === 0) {
    throw new Error(
      `No executable SQL statements found in ${migrationFile}. ` +
      'Refusing to mark migration as successful.'
    );
  }

  if (dryRun) {
    console.log(`  SQL preview (first 200 chars): ${sql.substring(0, 200)}...`);
    return { success: true, executionTime: 0 };
  }

  const startTime = Date.now();
  let error = null;

  try {
    for (const statement of statements) {
      const s = statement.trim();
      if (!s) continue;
      try {
        await clinicalPool.query(s);
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

function parseSpecificMigrationArg(args) {
  let specific = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i] || '');
    if (!arg) continue;
    if (arg.startsWith('--migration=')) {
      const value = arg.slice('--migration='.length).trim();
      if (value) specific = value;
      continue;
    }
    if (arg === '--migration') {
      const value = String(args[i + 1] || '').trim();
      if (value && !value.startsWith('--')) specific = value;
    }
  }
  return specific;
}

function parseUnlogArg(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--unlog') {
      const value = String(args[i + 1] || '').trim();
      if (value && !value.startsWith('--')) return value;
    }
    if (arg.startsWith('--unlog=')) {
      return arg.slice(8).trim();
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const baselineExisting = args.includes('--baseline-existing');
  const forceMigration = args.includes('--force');
  const specificMigration = parseSpecificMigrationArg(args);
  const unlogSpec = parseUnlogArg(args);

  try {
    await ensureMigrationsTable();

    if (unlogSpec) {
      const { migrationName, deleted } = await unlogMigration(unlogSpec);
      console.log(
        deleted > 0
          ? `✓ Removed ${migrationName} from ${MIGRATIONS_LOG_TABLE} (${deleted} row(s) deleted)`
          : `Migration ${migrationName} was not in ${MIGRATIONS_LOG_TABLE} (nothing to remove)`
      );
      if (!specificMigration && !args.includes('--migration')) {
        process.exit(0);
      }
    }

    console.log('Clinical Database Migration Runner');
    console.log('==================================');
    console.log(`Database: ${resolveClinicalDbLabel()}`);
    console.log(`Host: ${process.env.CLINICAL_DB_HOST || process.env.DB_HOST || 'localhost'}`);
    console.log(`Dry run: ${dryRun ? 'YES' : 'NO'}`);
    if (specificMigration) {
      console.log(`Specific migration: ${specificMigration}`);
    }
    if (forceMigration && specificMigration) {
      console.log('Force: YES (will run even if logged as successful)');
    }
    if (baselineExisting) {
      console.log('Baseline existing: YES');
    }
    console.log('');

    const migrationFiles = await getMigrationFiles();
    console.log(`Found ${migrationFiles.length} clinical migration files`);

    if (!dryRun && !specificMigration && baselineExisting) {
      console.log(`Bootstrapping ${MIGRATIONS_LOG_TABLE} for existing clinical database (no SQL execution)...`);
      for (const migrationFile of migrationFiles) {
        const migrationName = path.basename(migrationFile, '.sql');
        await recordMigration(migrationName, true, 0, null);
      }
      console.log(`✓ Baseline complete (${migrationFiles.length} migrations marked as applied)\n`);
      process.exit(0);
    }

    if (!dryRun && !specificMigration) {
      const appliedCount = await getAppliedMigrationCount();
      const existingSchema = await hasExistingClinicalSchema();
      if (appliedCount === 0 && existingSchema && !baselineExisting) {
        console.error('\nSafety stop: clinical schema detected but clinical_migrations_log is empty.');
        console.error('Running all clinical migrations from the beginning could replay legacy schema changes.');
        console.error('If this DB is already in use, run with --baseline-existing once, then run migrate-clinical again.\n');
        process.exit(1);
      }
    }

    if (specificMigration) {
      const migrationFile = migrationFiles.find((f) => f.startsWith(specificMigration));
      if (!migrationFile) {
        console.error(`Clinical migration ${specificMigration} not found`);
        process.exit(1);
      }
      const migrationName = path.basename(migrationFile, '.sql');
      if (!dryRun && !forceMigration && (await hasMigrationRun(migrationName))) {
        console.log(`Migration ${migrationName} has already been run. Use --force to re-run.`);
        process.exit(0);
      }
      const result = await runMigration(migrationFile, dryRun);
      process.exit(result.success ? 0 : 1);
    } else {
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
          console.error('\nMigration failed. Stopping.');
          break;
        }
      }

      const summary = {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length
      };

      console.log('\n==================================');
      console.log('Clinical Migration Summary');
      console.log('==================================');
      console.log(`Total: ${summary.total}`);
      console.log(`Successful: ${summary.successful}`);
      console.log(`Failed: ${summary.failed}`);

      process.exit(summary.failed > 0 ? 1 : 0);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await clinicalPool.end();
  }
}

main();
