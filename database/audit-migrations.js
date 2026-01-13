#!/usr/bin/env node
/**
 * Migration Audit Tool
 * 
 * Analyzes migrations to identify:
 * 1. Redundant migrations (later migrations negate earlier ones)
 * 2. Migrations that can be skipped for fresh databases
 * 3. Generates a consolidated migration set
 * 
 * Usage:
 *   node database/audit-migrations.js [--generate-consolidated]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Patterns that indicate a migration negates earlier work
const NEGATION_PATTERNS = {
  dropColumn: /DROP\s+COLUMN/i,
  dropTable: /DROP\s+TABLE/i,
  dropIndex: /DROP\s+INDEX/i,
  dropConstraint: /DROP\s+(FOREIGN\s+KEY|CONSTRAINT)/i,
  modifyColumn: /MODIFY\s+COLUMN/i,
  alterTable: /ALTER\s+TABLE/i,
  replaceColumn: /CHANGE\s+COLUMN|RENAME\s+COLUMN/i
};

// Patterns that indicate data migration (can be skipped for fresh DBs)
const DATA_MIGRATION_PATTERNS = {
  updateData: /UPDATE\s+\w+\s+SET/i,
  insertData: /INSERT\s+INTO/i,
  seedData: /seed|populate|default\s+data/i
};

// Track what each migration does
const migrationAnalysis = [];

async function analyzeMigration(file) {
  const filePath = path.join(MIGRATIONS_DIR, file);
  const content = await fs.readFile(filePath, 'utf-8');
  const migrationNum = parseInt(file.match(/^(\d+)/)?.[1] || '0');
  const migrationName = path.basename(file, '.sql');
  
  const analysis = {
    file,
    number: migrationNum,
    name: migrationName,
    creates: [],
    drops: [],
    modifies: [],
    updates: [],
    seeds: [],
    negates: [],
    isDataOnly: false,
    canSkipForFresh: false
  };
  
  // Extract table/column names from CREATE statements
  const createMatches = content.matchAll(/CREATE\s+(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/gi);
  for (const match of createMatches) {
    analysis.creates.push(match[1]);
  }
  
  // Extract table/column names from DROP statements
  const dropMatches = content.matchAll(/DROP\s+(?:TABLE|COLUMN|INDEX|FOREIGN\s+KEY|CONSTRAINT)\s+(?:IF\s+EXISTS\s+)?`?(\w+)`?/gi);
  for (const match of dropMatches) {
    analysis.drops.push(match[1]);
  }
  
  // Extract table/column names from ALTER/MODIFY statements
  const alterMatches = content.matchAll(/ALTER\s+TABLE\s+`?(\w+)`?\s+(?:ADD|MODIFY|DROP|CHANGE|RENAME)/gi);
  for (const match of alterMatches) {
    analysis.modifies.push(match[1]);
  }
  
  // Check for UPDATE statements (data migrations)
  if (DATA_MIGRATION_PATTERNS.updateData.test(content)) {
    analysis.updates.push('data');
    analysis.isDataOnly = analysis.creates.length === 0 && analysis.drops.length === 0;
  }
  
  // Check for INSERT/seed statements
  if (DATA_MIGRATION_PATTERNS.insertData.test(content) || DATA_MIGRATION_PATTERNS.seedData.test(content)) {
    analysis.seeds.push('data');
    analysis.isDataOnly = analysis.creates.length === 0 && analysis.drops.length === 0;
  }
  
  // Check if this migration negates earlier ones
  if (NEGATION_PATTERNS.dropColumn.test(content) || 
      NEGATION_PATTERNS.dropTable.test(content) ||
      NEGATION_PATTERNS.dropIndex.test(content) ||
      NEGATION_PATTERNS.dropConstraint.test(content)) {
    analysis.negates.push('structure');
  }
  
  // Check if this modifies/replaces something (likely negates earlier work)
  if (NEGATION_PATTERNS.modifyColumn.test(content) || 
      NEGATION_PATTERNS.replaceColumn.test(content)) {
    analysis.negates.push('column_definition');
  }
  
  return analysis;
}

async function findRedundantMigrations() {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const migrationFiles = files
    .filter(file => file.endsWith('.sql'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
      return numA - numB;
    });
  
  console.log('🔍 Analyzing migrations...\n');
  
  // Analyze all migrations
  for (const file of migrationFiles) {
    const analysis = await analyzeMigration(file);
    migrationAnalysis.push(analysis);
  }
  
  // Find migrations that negate earlier ones
  const redundant = [];
  const dataOnly = [];
  const canSkip = [];
  
  for (let i = 0; i < migrationAnalysis.length; i++) {
    const current = migrationAnalysis[i];
    
    // Check if this migration drops/modifies something created earlier
    for (let j = 0; j < i; j++) {
      const earlier = migrationAnalysis[j];
      
      // Check if current migration drops something earlier created (TRULY redundant)
      for (const dropped of current.drops) {
        if (earlier.creates.includes(dropped)) {
          redundant.push({
            negates: current,
            negated: earlier,
            reason: `Drops ${dropped} that was created in ${earlier.name}`,
            type: 'drop'
          });
        }
      }
      
      // Check if current migration completely replaces a structure (like dropping and recreating)
      // This is more nuanced - we need to check if it DROPS and then RECREATES the same thing
      const currentContent = await fs.readFile(path.join(MIGRATIONS_DIR, current.file), 'utf-8');
      const earlierContent = await fs.readFile(path.join(MIGRATIONS_DIR, earlier.file), 'utf-8');
      
      // Check if current migration drops a column/table that earlier created, then recreates it differently
      if (NEGATION_PATTERNS.dropColumn.test(currentContent) || 
          NEGATION_PATTERNS.dropTable.test(currentContent)) {
        // Check if it's replacing something (drop + create pattern)
        const hasReplacement = /DROP.*(?:COLUMN|TABLE).*CREATE|CHANGE\s+COLUMN|RENAME\s+COLUMN/i.test(currentContent);
        if (hasReplacement) {
          const common = current.modifies.filter(m => earlier.creates.includes(m));
          if (common.length > 0) {
            redundant.push({
              negates: current,
              negated: earlier,
              reason: `Replaces structure of ${common.join(', ')} that was created in ${earlier.name}`,
              type: 'replace'
            });
          }
        }
      }
    }
    
    // Identify data-only migrations
    if (current.isDataOnly && (current.updates.length > 0 || current.seeds.length > 0)) {
      dataOnly.push(current);
    }
    
    // Identify migrations that can be skipped for fresh DBs
    if (current.isDataOnly || 
        (current.updates.length > 0 && current.creates.length === 0 && current.drops.length === 0)) {
      canSkip.push(current);
    }
  }
  
  return { redundant, dataOnly, canSkip, all: migrationAnalysis };
}

async function generateConsolidatedMigration(analysis) {
  const { redundant, dataOnly, canSkip, all } = analysis;
  
  // Migrations to include in consolidated set (exclude redundant and data-only updates)
  const essentialMigrations = all.filter(m => {
    // Skip if it's negated by a later migration
    const isNegated = redundant.some(r => r.negated.file === m.file);
    if (isNegated) return false;
    
    // Skip pure data updates (but keep seed migrations for reference)
    if (m.isDataOnly && m.updates.length > 0 && m.seeds.length === 0) {
      return false;
    }
    
    return true;
  });
  
  // Generate consolidated migration file
  let consolidatedSQL = `-- Consolidated Migration for Fresh Database
-- Generated: ${new Date().toISOString()}
-- This migration combines all essential schema changes
-- Data-only migrations and negated migrations have been excluded
--
-- Total migrations analyzed: ${all.length}
-- Essential migrations included: ${essentialMigrations.length}
-- Redundant migrations excluded: ${redundant.length}
-- Data-only migrations excluded: ${dataOnly.length}
--

`;
  
  // Add each essential migration's content
  for (const migration of essentialMigrations) {
    const filePath = path.join(MIGRATIONS_DIR, migration.file);
    const content = await fs.readFile(filePath, 'utf-8');
    
    consolidatedSQL += `-- ========================================
-- Migration: ${migration.name}
-- File: ${migration.file}
-- ========================================
${content}

`;
  }
  
  return consolidatedSQL;
}

async function main() {
  const args = process.argv.slice(2);
  const generateConsolidated = args.includes('--generate-consolidated');
  
  try {
    const analysis = await findRedundantMigrations();
    const { redundant, dataOnly, canSkip, all } = analysis;
    
    console.log('📊 MIGRATION AUDIT RESULTS');
    console.log('='.repeat(60));
    console.log(`Total migrations: ${all.length}\n`);
    
    // Report redundant migrations
    if (redundant.length > 0) {
      console.log('⚠️  REDUNDANT MIGRATIONS (later migrations negate earlier ones):');
      console.log('-'.repeat(60));
      redundant.forEach((r, i) => {
        console.log(`\n${i + 1}. ${r.negates.name} (${r.negates.file})`);
        console.log(`   Negates: ${r.negated.name} (${r.negated.file})`);
        console.log(`   Reason: ${r.reason}`);
      });
      console.log('\n');
    } else {
      console.log('✅ No redundant migrations found\n');
    }
    
    // Report data-only migrations
    if (dataOnly.length > 0) {
      console.log('📝 DATA-ONLY MIGRATIONS (can be skipped for fresh DBs):');
      console.log('-'.repeat(60));
      dataOnly.forEach((m, i) => {
        console.log(`${i + 1}. ${m.name} (${m.file})`);
        if (m.updates.length > 0) console.log('   - Contains UPDATE statements');
        if (m.seeds.length > 0) console.log('   - Contains INSERT/seed data');
      });
      console.log('\n');
    }
    
    // Report migrations that can be skipped
    if (canSkip.length > 0) {
      console.log('⏭️  MIGRATIONS THAT CAN BE SKIPPED FOR FRESH DATABASES:');
      console.log('-'.repeat(60));
      canSkip.forEach((m, i) => {
        console.log(`${i + 1}. ${m.name} (${m.file})`);
      });
      console.log('\n');
    }
    
    // Generate consolidated migration if requested
    if (generateConsolidated) {
      console.log('📦 Generating consolidated migration...');
      const consolidated = await generateConsolidatedMigration(analysis);
      const outputPath = path.join(__dirname, 'migrations', '000_consolidated_fresh_database.sql');
      await fs.writeFile(outputPath, consolidated);
      console.log(`✅ Consolidated migration created: ${outputPath}`);
      console.log(`   Includes ${essentialMigrations.length} essential migrations`);
      console.log(`   Excludes ${redundant.length} redundant migrations`);
      console.log(`   Excludes ${dataOnly.length} data-only migrations\n`);
    }
    
    // Summary
    console.log('📋 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Essential migrations for fresh DB: ${all.length - canSkip.length - redundant.length}`);
    console.log(`Can skip for fresh DB: ${canSkip.length}`);
    console.log(`Redundant (negated by later migrations): ${redundant.length}`);
    console.log(`Data-only migrations: ${dataOnly.length}`);
    
    if (generateConsolidated) {
      console.log(`\n💡 Use the consolidated migration (000_consolidated_fresh_database.sql) for fresh databases`);
    } else {
      console.log(`\n💡 Run with --generate-consolidated to create a consolidated migration file`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
