#!/usr/bin/env node
/**
 * Create Fresh Database Init Script
 * 
 * This script analyzes your migrations and creates a clean init.sql
 * that represents the FINAL schema state, excluding:
 * - Migrations that drop things created earlier (truly redundant)
 * - Data-only UPDATE migrations (not needed for fresh DBs)
 * - Migrations that are completely negated by later ones
 * 
 * Usage:
 *   node database/create-fresh-init.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Migrations that should be SKIPPED for fresh databases
const SKIP_FOR_FRESH = [
  // Programs system was removed
  '002_add_programs',
  '011_add_program_modules_relationship',
  '012a_drop_program_id_columns',
  '012_remove_programs_consolidate_to_tracks',
  
  // Data-only migrations (UPDATE existing data)
  '010_add_super_admin_module_features',  // Updates existing modules
  '028_update_existing_user_status',      // Updates existing users
  '029_enforce_status_not_null',         // Updates existing users (we'll include schema part)
  '030_reset_all_users_to_active',       // Updates existing users
  '045_add_agency_default_password_toggle', // Updates existing agencies
  '084_ensure_superadmin_protection',    // Updates existing users
  '087_set_supervisor_privileges_for_existing', // Updates existing users
  '097_update_admin_statuses',           // Updates existing users
  
  // Status migrations that are replaced by 095
  '027_add_user_status',                 // Replaced by 095
  '028_update_existing_user_status',     // Data only
  '029_enforce_status_not_null',         // Replaced by 095
  '071_add_pending_status',               // Replaced by 095
  
  // Phone number restructuring (086 replaces 018)
  '018_add_user_phone',                  // Replaced by 086
  
  // Email nullable (075 replaces earlier email constraints)
  '075_make_email_nullable',             // Just modifies constraint
  
  // Notification type conversion (080 replaces ENUM with VARCHAR)
  '080_convert_notification_type_to_varchar', // Just converts type
  
  // Email template constraints (089 removes constraints from 063)
  '089_remove_email_template_unique_constraints', // Just removes constraints
];

async function getMigrationFiles() {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter(file => file.endsWith('.sql'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
      return numA - numB;
    });
}

async function createFreshInit() {
  const files = await getMigrationFiles();
  const essentialFiles = [];
  const skippedFiles = [];
  
  for (const file of files) {
    const migrationName = path.basename(file, '.sql');
    const shouldSkip = SKIP_FOR_FRESH.some(skip => migrationName.includes(skip));
    
    if (shouldSkip) {
      skippedFiles.push(file);
      console.log(`⏭️  Skipping: ${file}`);
    } else {
      essentialFiles.push(file);
    }
  }
  
  // Generate fresh init SQL
  let initSQL = `-- Fresh Database Schema
-- Generated: ${new Date().toISOString()}
-- This file represents the FINAL desired database schema
-- Use this for fresh database installations instead of running all migrations
--
-- Total migrations: ${files.length}
-- Essential migrations included: ${essentialFiles.length}
-- Migrations skipped: ${skippedFiles.length}
--
-- Skipped migrations (not needed for fresh DBs):
${skippedFiles.map(f => `--   - ${f}`).join('\n')}
--

`;

  // Read and combine essential migrations
  for (const file of essentialFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const content = await fs.readFile(filePath, 'utf-8');
    
    initSQL += `-- ========================================
-- From: ${file}
-- ========================================
${content}

`;
  }
  
  const outputPath = path.join(__dirname, 'fresh_init.sql');
  await fs.writeFile(outputPath, initSQL);
  
  console.log('\n✅ Fresh init file created!');
  console.log(`   File: ${outputPath}`);
  console.log(`   Essential migrations: ${essentialFiles.length}`);
  console.log(`   Skipped migrations: ${skippedFiles.length}`);
  console.log(`   File size: ${(initSQL.length / 1024).toFixed(2)} KB\n`);
  console.log('💡 Use fresh_init.sql for new database installations!');
}

createFreshInit().catch(console.error);
