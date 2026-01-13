#!/usr/bin/env node
/**
 * Migration Cleanup Report
 * 
 * Generates a detailed report of migrations that can be safely removed
 * for fresh database installations, organized by category.
 * 
 * Usage:
 *   node database/migration-cleanup-report.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function analyzeMigration(file) {
  const filePath = path.join(MIGRATIONS_DIR, file);
  const content = await fs.readFile(filePath, 'utf-8');
  const migrationNum = parseInt(file.match(/^(\d+)/)?.[1] || '0');
  const migrationName = path.basename(file, '.sql');
  
  return {
    file,
    number: migrationNum,
    name: migrationName,
    content,
    hasDrop: /DROP\s+(?:COLUMN|TABLE|INDEX|FOREIGN\s+KEY|CONSTRAINT)/i.test(content),
    hasUpdate: /UPDATE\s+\w+\s+SET/i.test(content),
    hasInsert: /INSERT\s+INTO/i.test(content),
    hasCreate: /CREATE\s+(?:TABLE|INDEX)/i.test(content),
    hasAlter: /ALTER\s+TABLE/i.test(content),
    hasReplace: /CHANGE\s+COLUMN|RENAME\s+COLUMN|DROP.*CREATE/i.test(content)
  };
}

async function generateReport() {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const migrationFiles = files
    .filter(file => file.endsWith('.sql'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
      return numA - numB;
    });
  
  console.log('🔍 Analyzing migrations for cleanup report...\n');
  
  const analyses = [];
  for (const file of migrationFiles) {
    analyses.push(await analyzeMigration(file));
  }
  
  // Categorize migrations
  const trulyRedundant = []; // Drops things created earlier
  const dataOnly = []; // Only UPDATE/INSERT data, no schema changes
  const replaced = []; // Completely replaced by later migrations
  const safeToKeep = []; // Essential schema changes
  
  // Check for truly redundant (drops)
  for (let i = 0; i < analyses.length; i++) {
    const current = analyses[i];
    
    if (current.hasDrop) {
      // Check if it drops something created earlier
      for (let j = 0; j < i; j++) {
        const earlier = analyses[j];
        if (earlier.hasCreate) {
          // Check if current drops something earlier created
          const earlierCreates = current.content.match(/CREATE\s+(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/gi);
          const currentDrops = current.content.match(/DROP\s+(?:TABLE|COLUMN|INDEX)\s+(?:IF\s+EXISTS\s+)?`?(\w+)`?/gi);
          
          if (currentDrops && earlierCreates) {
            // Simple check: if migration name suggests it's removing something
            if (current.name.includes('drop') || current.name.includes('remove')) {
              trulyRedundant.push({
                migration: current,
                reason: 'Drops structure created in earlier migration',
                negates: earlier
              });
              break;
            }
          }
        }
      }
    }
    
    // Check if data-only
    if ((current.hasUpdate || current.hasInsert) && !current.hasCreate && !current.hasAlter) {
      dataOnly.push({
        migration: current,
        reason: 'Only contains data updates/inserts, no schema changes'
      });
    }
    
    // Check if replaced (status migrations)
    if (current.name.includes('status') && current.number < 95) {
      replaced.push({
        migration: current,
        reason: 'Status system replaced by migration 095_refactor_user_status_lifecycle'
      });
    }
    
    // Check if it's a constraint removal (089 removes constraints from 063)
    if (current.name.includes('remove') && current.name.includes('constraint')) {
      replaced.push({
        migration: current,
        reason: 'Removes constraints - not needed for fresh DBs'
      });
    }
  }
  
  // Known redundant migrations
  const knownRedundant = [
    { file: '002_add_programs.sql', reason: 'Programs system was removed (012a drops it)' },
    { file: '011_add_program_modules_relationship.sql', reason: 'Programs system was removed' },
    { file: '012a_drop_program_id_columns.sql', reason: 'Drops columns from removed programs system' },
    { file: '012_remove_programs_consolidate_to_tracks.sql', reason: 'Removes programs, consolidates to tracks' },
    { file: '018_add_user_phone.sql', reason: 'Replaced by 086_restructure_phone_numbers' },
    { file: '027_add_user_status.sql', reason: 'Replaced by 095_refactor_user_status_lifecycle' },
    { file: '028_update_existing_user_status.sql', reason: 'Data-only: updates existing user statuses' },
    { file: '029_enforce_status_not_null.sql', reason: 'Replaced by 095_refactor_user_status_lifecycle' },
    { file: '030_reset_all_users_to_active.sql', reason: 'Data-only: resets existing users' },
    { file: '071_add_pending_status.sql', reason: 'Replaced by 095_refactor_user_status_lifecycle' },
    { file: '075_make_email_nullable.sql', reason: 'Just modifies constraint - can be in fresh schema' },
    { file: '080_convert_notification_type_to_varchar.sql', reason: 'Just converts ENUM to VARCHAR - can be in fresh schema' },
    { file: '089_remove_email_template_unique_constraints.sql', reason: 'Removes constraints - not needed for fresh DBs' },
  ];
  
  const knownDataOnly = [
    { file: '010_add_super_admin_module_features.sql', reason: 'Updates existing modules with super admin features' },
    { file: '045_add_agency_default_password_toggle.sql', reason: 'Updates existing agencies' },
    { file: '084_ensure_superadmin_protection.sql', reason: 'Updates existing users' },
    { file: '087_set_supervisor_privileges_for_existing.sql', reason: 'Updates existing users' },
    { file: '097_update_admin_statuses.sql', reason: 'Updates existing admin users' },
  ];
  
  console.log('📊 MIGRATION CLEANUP REPORT');
  console.log('='.repeat(70));
  console.log(`Total migrations: ${analyses.length}\n`);
  
  console.log('🗑️  MIGRATIONS TO REMOVE FOR FRESH DATABASES:');
  console.log('-'.repeat(70));
  
  const allToRemove = [...knownRedundant, ...knownDataOnly];
  allToRemove.forEach((item, i) => {
    console.log(`${i + 1}. ${item.file}`);
    console.log(`   Reason: ${item.reason}`);
  });
  
  console.log(`\n   Total to remove: ${allToRemove.length}`);
  console.log(`   Remaining essential: ${analyses.length - allToRemove.length}\n`);
  
  console.log('💡 RECOMMENDATION:');
  console.log('-'.repeat(70));
  console.log('1. Keep all migrations for existing databases (they need the history)');
  console.log('2. For fresh databases, use: database/fresh_init.sql');
  console.log('3. Or manually skip the migrations listed above when setting up new DBs');
  console.log('\n');
  
  // Generate skip list for migration runner
  const skipList = allToRemove.map(item => item.file.replace('.sql', '')).join(', ');
  console.log('📝 MIGRATION NAMES TO SKIP:');
  console.log('-'.repeat(70));
  console.log(skipList);
  console.log('\n');
}

generateReport().catch(console.error);
