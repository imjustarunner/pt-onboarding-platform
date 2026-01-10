import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, '../../../database/migrations');

async function runSpecificMigration(filename) {
  try {
    const filePath = path.join(migrationsDir, filename);
    if (!fs.existsSync(filePath)) {
      console.error(`Migration file not found: ${filename}`);
      process.exit(1);
    }

    console.log(`Running migration: ${filename}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split by semicolons and execute each statement
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await pool.execute(statement.trim() + ';');
        } catch (error) {
          if (error.message.includes('already exists') || 
              error.message.includes('Duplicate key') ||
              error.message.includes('Duplicate column') ||
              error.message.includes("doesn't exist") ||
              error.message.includes('Unknown key') ||
              error.message.includes('check that it exists')) {
            console.log(`⚠️  Skipping (already handled): ${error.message}`);
          } else {
            console.error(`Error in ${filename}:`, error.message);
            throw error;
          }
        }
      }
    }
    
    console.log(`✅ Completed: ${filename}`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

const filename = process.argv[2] || '049_create_agency_checklist_enabled_items.sql';
runSpecificMigration(filename);

