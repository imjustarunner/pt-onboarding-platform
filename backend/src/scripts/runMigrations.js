import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file, but don't override existing env vars
// By default, dotenv.config() does NOT override existing environment variables
dotenv.config();

// Log database connection info before importing database.js (which creates the pool)
console.log('📊 Database connection configuration:');
console.log(`   DB_HOST: ${process.env.DB_HOST || 'localhost (default)'}`);
console.log(`   DB_PORT: ${process.env.DB_PORT || '3307 (default)'}`);
console.log(`   DB_NAME: ${process.env.DB_NAME || 'onboarding_db (default)'}`);
console.log(`   DB_USER: ${process.env.DB_USER || 'onboarding_user (default)'}`);
console.log('');

import pool from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migrations are in the root database/migrations folder, go up 3 levels from backend/src/scripts
const migrationsDir = path.join(__dirname, '../../../database/migrations');

// Check for --collect-errors / --force flags
const collectErrors = process.argv.includes('--collect-errors');
const forceRerun = process.argv.includes('--force');

const FORBIDDEN_LIVE_MIGRATIONS = new Set([
  // Fresh-DB bootstrap dump. Re-running against a live DB collapses users.role to the
  // ancient ENUM(default clinician) and wipes provider/school_staff/guardian/etc.
  '000_consolidated_fresh_database.sql'
]);

function parseOnlyArg(argv) {
  // Supports:
  //   --only 289
  //   --only 289_user_preferences_schedule_color_overrides.sql
  //   --only=289
  //   --only=289_user_preferences_schedule_color_overrides.sql
  const idx = argv.findIndex((a) => a === '--only');
  if (idx >= 0) {
    const v = argv[idx + 1];
    return v ? String(v).trim() : null;
  }
  const eq = argv.find((a) => String(a || '').startsWith('--only='));
  if (eq) return String(eq).slice('--only='.length).trim() || null;
  return null;
}

function parseFromArg(argv) {
  // Supports:
  //   --from 289
  //   --from=289
  const idx = argv.findIndex((a) => a === '--from');
  if (idx >= 0) {
    const v = argv[idx + 1];
    return v ? String(v).trim() : null;
  }
  const eq = argv.find((a) => String(a || '').startsWith('--from='));
  if (eq) return String(eq).slice('--from='.length).trim() || null;
  return null;
}

const only = parseOnlyArg(process.argv);
const from = parseFromArg(process.argv);

async function runMigrations() {
  // Test connection before running migrations
  try {
    console.log('🔌 Testing database connection...');
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Database connection verified\n');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error.message);
    console.error(`   Host: ${process.env.DB_HOST || 'localhost'}`);
    console.error(`   Port: ${process.env.DB_PORT || '3307'}`);
    console.error(`   Database: ${process.env.DB_NAME || 'onboarding_db'}`);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Verify the database server is running');
    console.error('   2. Check DB_HOST, DB_PORT, DB_NAME environment variables');
    console.error('   3. Verify network connectivity and firewall settings');
    console.error('   4. If using Cloud SQL proxy, ensure it\'s running and connected');
    process.exit(1);
  }

  const errors = [];
  let hasErrors = false;
  let ran = 0;
  let skipped = 0;

  try {
    await pool.query(`
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

    const [logRows] = await pool.query(
      'SELECT migration_name FROM migrations_log WHERE success = 1'
    );
    const applied = new Set((logRows || []).map((r) => String(r.migration_name || '')));

    // Get all migration files sorted.
    // NEVER auto-run the fresh-DB bootstrap dump against a live database — it rewrites
    // users.role back to the ancient ENUM(default clinician) and collapses everyone's roles.
    let files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql') && !FORBIDDEN_LIVE_MIGRATIONS.has(file))
      .sort();

    if (only) {
      const needle = String(only).trim();
      const isNum = /^\d+$/.test(needle);
      files = files.filter((f) => {
        if (isNum) return f.startsWith(needle);
        if (needle.endsWith('.sql')) return f === needle;
        return f.includes(needle);
      });
      if (files.length === 0) {
        console.error(`❌ No migrations matched --only ${JSON.stringify(only)}`);
        console.error(`   Migrations dir: ${migrationsDir}`);
        process.exit(1);
      }
      console.log(`🔎 --only enabled: running ${files.length} migration(s): ${files.join(', ')}`);
    }

    if (!only && from) {
      const start = parseInt(String(from).trim(), 10);
      if (!Number.isFinite(start) || start <= 0) {
        console.error(`❌ Invalid --from value: ${JSON.stringify(from)}`);
        process.exit(1);
      }
      files = files.filter((f) => {
        const m = String(f).match(/^(\d+)/);
        if (!m) return false;
        const n = parseInt(m[1], 10);
        return Number.isFinite(n) && n >= start;
      });
      if (files.length === 0) {
        console.error(`❌ No migrations found with numeric prefix >= ${start}`);
        process.exit(1);
      }
      console.log(`🔎 --from enabled: running ${files.length} migration(s) starting at ${start}`);
    }

    console.log(`Found ${files.length} migration files (${applied.size} already applied in migrations_log)`);
    if (collectErrors) {
      console.log('📋 Running in collect-errors mode: will continue after failures\n');
    }
    if (forceRerun) {
      console.log('⚠️  --force enabled: will re-run migrations even if already logged as success\n');
    }

    for (const file of files) {
      if (FORBIDDEN_LIVE_MIGRATIONS.has(file)) {
        console.log(`🚫 Skipping forbidden live migration: ${file}`);
        skipped++;
        continue;
      }

      const migrationName = file.replace(/\.sql$/, '');
      if (!forceRerun && applied.has(migrationName)) {
        skipped++;
        continue;
      }

      console.log(`Running migration: ${file}`);
      const startTime = Date.now();
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      // Handle CREATE TRIGGER and DROP TRIGGER specially - they can't be split by semicolons
      // and may not work with prepared statements, so use query() instead
      const isTriggerStatement = sql.trim().toUpperCase().includes('CREATE TRIGGER') || 
                                  sql.trim().toUpperCase().includes('DROP TRIGGER');
      
      let fileHasError = false;
      
      if (isTriggerStatement) {
        // For trigger statements, execute as raw query (not prepared statement)
        // CREATE TRIGGER with BEGIN/END blocks can't be split by semicolons
        try {
          // Parse SQL to handle BEGIN/END blocks properly
          // Split by semicolons but track BEGIN/END to keep trigger blocks together
          const statements = [];
          let currentStatement = '';
          let beginDepth = 0;
          
          // Split by semicolons
          const parts = sql.split(';');
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part.trim() && i < parts.length - 1) continue; // Skip empty parts except last
            
            // Add this part to current statement
            if (currentStatement) {
              currentStatement += ';' + part;
            } else {
              currentStatement = part;
            }
            
            // Count BEGIN and END keywords (case-insensitive, whole word only)
            const upperPart = part.toUpperCase();
            // Count BEGIN
            const beginCount = (upperPart.match(/\bBEGIN\b/g) || []).length;
            // Count END only when it's standalone (not END IF, END CASE, END LOOP, etc.)
            // We check by looking for END followed by semicolon or end of string, but not by IF/CASE/etc.
            let endCount = 0;
            const endRegex = /\bEND\b/g;
            let match;
            while ((match = endRegex.exec(upperPart)) !== null) {
              const afterEnd = upperPart.substring(match.index + match[0].length).trim();
              // Only count if END is followed by semicolon or end of string (not IF, CASE, etc.)
              if (afterEnd.startsWith(';') || afterEnd === '') {
                endCount++;
              }
            }
            
            beginDepth += beginCount - endCount;
            
            // Only split on semicolon if we're not inside a BEGIN/END block
            if (beginDepth === 0 && currentStatement.trim()) {
              const trimmed = currentStatement.trim();
              if (trimmed && !trimmed.startsWith('--')) {
                statements.push(trimmed);
              }
              currentStatement = '';
            }
          }
          
          // Add any remaining statement
          if (currentStatement.trim() && !currentStatement.trim().startsWith('--')) {
            statements.push(currentStatement.trim());
          }
          
          // Execute each statement using query() for raw SQL (triggers need this)
          for (const statement of statements) {
            if (statement.trim()) {
              // Ensure statement ends with semicolon
              const sqlStatement = statement.trim().endsWith(';') ? statement.trim() : statement.trim() + ';';
              await pool.query(sqlStatement);
            }
          }
        } catch (error) {
          // Some errors are expected
          if (!error.message.includes('already exists') && 
              !error.message.includes('Duplicate') &&
              !error.message.includes('duplicate foreign key') &&
              !error.message.includes('doesn\'t exist') &&
              !error.message.includes('Unknown') &&
              !error.message.includes('check that it exists') &&
              error.code !== 'ER_FK_DUP_NAME' &&
              error.errno !== 1022) {
            
            const errorInfo = {
              filename: file,
              sqlMessage: error.sqlMessage || error.message,
              sqlState: error.sqlState || 'N/A',
              errno: error.errno || 'N/A',
              code: error.code || 'N/A'
            };
            
            errors.push(errorInfo);
            hasErrors = true;
            fileHasError = true;
            
            console.error(`❌ Error in ${file}:`);
            console.error(`   Message: ${errorInfo.sqlMessage}`);
            console.error(`   SQL State: ${errorInfo.sqlState}`);
            console.error(`   Error Code: ${errorInfo.code} (${errorInfo.errno})`);
            
            if (collectErrors) {
              console.log(`⚠️  Continuing to next migration...\n`);
            } else {
              throw error;
            }
          } else {
            console.log(`⚠️  Skipping expected error in ${file}: ${error.message}`);
          }
        }
      } else {
        // Split by semicolons and execute each statement
        const statements = sql.split(';').filter(s => s.trim().length > 0);
        
        for (const statement of statements) {
          if (statement.trim()) {
            try {
              await pool.execute(statement.trim() + ';');
            } catch (error) {
            // Check if this is an unsupported prepared statement error
            // If so, retry using pool.query() instead
            if (error.code === 'ER_UNSUPPORTED_PS' || error.errno === 1295 || 
                error.message.includes('not supported in the prepared statement protocol')) {
              try {
                // Retry with raw query instead of prepared statement
                await pool.query(statement.trim() + ';');
                // Success - continue to next statement
                continue;
              } catch (retryError) {
                // If retry also fails, treat as normal error
                error = retryError;
              }
            }
            
            // Some errors are expected (like table already exists, or constraint/column doesn't exist)
            if (!error.message.includes('already exists') && 
                !error.message.includes('Duplicate key') &&
                !error.message.includes('Duplicate column') &&
                !error.message.includes('Duplicate foreign key') &&
                !error.message.includes('duplicate foreign key') &&
                !error.message.includes('doesn\'t exist') &&
                !error.message.includes('Unknown') &&
                !error.message.includes('check that it exists') &&
                !error.message.includes('check that column/key exists') &&
                !error.message.includes('needed in a foreign key constraint') &&
                !error.message.includes('ER_FK_COLUMN_CANNOT_DROP') &&
                error.code !== 'ER_UNSUPPORTED_PS' &&
                error.code !== 'ER_FK_DUP_NAME' &&
                error.errno !== 1295 &&
                error.errno !== 1022) {
              
              // This is an unexpected error
              const errorInfo = {
                filename: file,
                sqlMessage: error.sqlMessage || error.message,
                sqlState: error.sqlState || 'N/A',
                errno: error.errno || 'N/A',
                code: error.code || 'N/A'
              };
              
              errors.push(errorInfo);
              hasErrors = true;
              fileHasError = true;
              
              console.error(`❌ Error in ${file}:`);
              console.error(`   Message: ${errorInfo.sqlMessage}`);
              console.error(`   SQL State: ${errorInfo.sqlState}`);
              console.error(`   Error Code: ${errorInfo.code} (${errorInfo.errno})`);
              
              if (collectErrors) {
                console.log(`⚠️  Continuing to next migration...\n`);
                // Break out of statement loop but continue to next file
                break;
              } else {
                // Normal mode: throw and stop
                throw error;
              }
            } else {
              console.log(`⚠️  Skipping expected error in ${file}: ${error.message}`);
            }
            } // Close catch block
          } // Close if (statement.trim())
        } // Close for loop
      } // Close else (non-trigger path)
      
      const ms = Date.now() - startTime;
      if (!fileHasError) {
        await pool.query(
          `INSERT INTO migrations_log (migration_name, execution_time_ms, success, error_message)
           VALUES (?, ?, 1, NULL)
           ON DUPLICATE KEY UPDATE executed_at = CURRENT_TIMESTAMP, execution_time_ms = ?, success = 1, error_message = NULL`,
          [migrationName, ms, ms]
        );
        applied.add(migrationName);
        ran++;
        console.log(`✅ Completed: ${file}`);
      } else {
        const errMsg = errors.filter((e) => e.filename === file).map((e) => e.sqlMessage).join(' | ') || 'failed';
        await pool.query(
          `INSERT INTO migrations_log (migration_name, execution_time_ms, success, error_message)
           VALUES (?, ?, 0, ?)
           ON DUPLICATE KEY UPDATE executed_at = CURRENT_TIMESTAMP, execution_time_ms = ?, success = 0, error_message = ?`,
          [migrationName, ms, errMsg.slice(0, 2000), ms, errMsg.slice(0, 2000)]
        ).catch(() => {});
      }
    }

    console.log(`\n✅ Migrations finished — ${ran} applied, ${skipped} skipped (already run)`);

    // Print summary if in collect-errors mode
    if (collectErrors && errors.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('📊 MIGRATION ERROR SUMMARY');
      console.log('='.repeat(60));
      console.log(`Total migrations considered: ${files.length}`);
      console.log(`Failed migrations: ${errors.length}`);
      console.log(`Successful migrations this run: ${ran}`);
      console.log('\nFailed migrations:');
      errors.forEach((error, index) => {
        console.log(`\n${index + 1}. ${error.filename}`);
        console.log(`   Message: ${error.sqlMessage}`);
        console.log(`   SQL State: ${error.sqlState}`);
        console.log(`   Error Code: ${error.code} (${error.errno})`);
      });
      console.log('\n' + '='.repeat(60));
    } else if (!hasErrors) {
      console.log('✅ All migrations completed successfully');
    }
  } catch (error) {
    if (!collectErrors) {
      // In normal mode, this is an unexpected error
      console.error('❌ Migration failed:', error);
      throw error;
    }
    // In collect-errors mode, errors are already collected above
  } finally {
    // Exit with code 1 if any errors occurred, 0 otherwise
    process.exit(hasErrors ? 1 : 0);
  }
}

runMigrations();
