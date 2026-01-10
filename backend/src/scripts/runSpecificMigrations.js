import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, '../../../database/migrations');

async function runSpecificMigrations(filenames) {
  try {
    for (const filename of filenames) {
      const filePath = path.join(migrationsDir, filename);
      if (!fs.existsSync(filePath)) {
        console.error(`Migration file not found: ${filename}`);
        continue;
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
                error.message.includes('check that it exists') ||
                error.message.includes('Duplicate entry')) {
              console.log(`⚠️  Skipping (already handled): ${error.message}`);
            } else {
              console.error(`Error in ${filename}:`, error.message);
              throw error;
            }
          }
        }
      }
      
      console.log(`✅ Completed: ${filename}`);
    }
    
    console.log('✅ All specified migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Get migrations from command line args
const migrations = process.argv.slice(2);
if (migrations.length === 0) {
  console.error('Please specify migration files to run');
  process.exit(1);
}

runSpecificMigrations(migrations);
