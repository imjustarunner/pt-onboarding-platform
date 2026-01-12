#!/usr/bin/env node
/**
 * Check which migrations from 085 onwards have been run
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './backend/src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'database/migrations');

async function checkMigrations() {
  try {
    // Get all migration files from 085 onwards
    const files = await fs.readdir(MIGRATIONS_DIR);
    const migrations = files
      .filter(file => file.endsWith('.sql'))
      .filter(file => {
        const match = file.match(/^(\d+)/);
        if (!match) return false;
        const num = parseInt(match[1]);
        return num >= 85;
      })
      .sort((a, b) => {
        const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    console.log('Migrations from 085 onwards:');
    console.log('============================\n');

    // Check migrations_log table
    let migrationsLog = [];
    try {
      const [rows] = await pool.execute('SELECT migration_name, executed_at, success FROM migrations_log ORDER BY executed_at DESC');
      migrationsLog = rows;
    } catch (err) {
      console.log('⚠️  migrations_log table does not exist yet. All migrations will be listed as not run.\n');
    }

    const runMigrations = new Set(migrationsLog.filter(r => r.success === 1).map(r => r.migration_name));

    for (const file of migrations) {
      const migrationName = path.basename(file, '.sql');
      const isRun = runMigrations.has(migrationName);
      const status = isRun ? '✅ RUN' : '❌ NOT RUN';
      console.log(`${status} - ${file}`);
    }

    console.log('\n============================');
    const notRun = migrations.filter(f => !runMigrations.has(path.basename(f, '.sql')));
    console.log(`Total: ${migrations.length}`);
    console.log(`Run: ${migrations.length - notRun.length}`);
    console.log(`Not Run: ${notRun.length}`);
    
    if (notRun.length > 0) {
      console.log('\nMigrations that need to be run:');
      notRun.forEach(f => console.log(`  - ${f}`));
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkMigrations();
