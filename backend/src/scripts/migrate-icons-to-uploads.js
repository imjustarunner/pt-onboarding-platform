/**
 * Migration Script: Move icons from icons/ to uploads/icons/
 * 
 * This script:
 * 1. Finds all icons in the database with old paths (icons/...)
 * 2. Copies them from GCS icons/ to uploads/icons/
 * 3. Updates the database file_path to the new location
 * 4. Optionally deletes old files (dry-run mode available)
 * 
 * Usage:
 *   node src/scripts/migrate-icons-to-uploads.js [--dry-run] [--delete-old]
 * 
 * Options:
 *   --dry-run: Show what would be migrated without making changes
 *   --delete-old: Delete old files after successful migration (default: keep old files)
 */

import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import pool from '../config/database.js';

// Load environment variables
dotenv.config();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const deleteOld = args.includes('--delete-old');

async function migrateIcons() {
  console.log('='.repeat(60));
  console.log('Icon Migration Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Delete old files: ${deleteOld ? 'YES' : 'NO (keeping old files)'}`);
  console.log('='.repeat(60));
  console.log();

  // Initialize GCS
  const bucketName = process.env.PTONBOARDFILES;
  if (!bucketName) {
    throw new Error('PTONBOARDFILES environment variable not set');
  }

  const storage = new Storage();
  const bucket = storage.bucket(bucketName);

  console.log(`Connecting to GCS bucket: ${bucketName}`);
  console.log();

  // Find all icons with old paths
  const [icons] = await pool.execute(
    "SELECT id, name, file_path FROM icons WHERE file_path LIKE 'icons/%' AND file_path NOT LIKE 'uploads/%'"
  );

  console.log(`Found ${icons.length} icons with old paths to migrate`);
  console.log();

  if (icons.length === 0) {
    console.log('No icons to migrate. All icons are already in the new location!');
    return;
  }

  const results = {
    success: 0,
    skipped: 0,
    errors: 0,
    errorsList: []
  };

  for (const icon of icons) {
    const oldPath = icon.file_path; // e.g., "icons/icon-123.png"
    const filename = oldPath.replace('icons/', ''); // e.g., "icon-123.png"
    const newPath = `uploads/icons/${filename}`; // e.g., "uploads/icons/icon-123.png"

    console.log(`[${icon.id}] ${icon.name}`);
    console.log(`  Old path: ${oldPath}`);
    console.log(`  New path: ${newPath}`);

    try {
      // Check if old file exists
      const oldFile = bucket.file(oldPath);
      const [oldExists] = await oldFile.exists();

      if (!oldExists) {
        console.log(`  ⚠️  WARNING: Old file not found in GCS, skipping`);
        results.skipped++;
        console.log();
        continue;
      }

      // Check if new file already exists
      const newFile = bucket.file(newPath);
      const [newExists] = await newFile.exists();

      if (newExists) {
        console.log(`  ℹ️  New file already exists, updating database only`);
        if (!isDryRun) {
          await pool.execute(
            'UPDATE icons SET file_path = ? WHERE id = ?',
            [newPath, icon.id]
          );
        }
        results.success++;
        console.log();
        continue;
      }

      // Copy file
      if (!isDryRun) {
        await oldFile.copy(newFile);
        console.log(`  ✓  File copied to new location`);

        // Update database
        await pool.execute(
          'UPDATE icons SET file_path = ? WHERE id = ?',
          [newPath, icon.id]
        );
        console.log(`  ✓  Database updated`);

        // Delete old file if requested
        if (deleteOld) {
          await oldFile.delete();
          console.log(`  ✓  Old file deleted`);
        }
      } else {
        console.log(`  [DRY RUN] Would copy file and update database`);
        if (deleteOld) {
          console.log(`  [DRY RUN] Would delete old file`);
        }
      }

      results.success++;
    } catch (error) {
      console.log(`  ✗  ERROR: ${error.message}`);
      results.errors++;
      results.errorsList.push({
        iconId: icon.id,
        iconName: icon.name,
        error: error.message
      });
    }

    console.log();
  }

  // Summary
  console.log('='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total icons processed: ${icons.length}`);
  console.log(`✓  Successfully migrated: ${results.success}`);
  console.log(`⚠️  Skipped: ${results.skipped}`);
  console.log(`✗  Errors: ${results.errors}`);

  if (results.errors > 0) {
    console.log();
    console.log('Errors:');
    results.errorsList.forEach(({ iconId, iconName, error }) => {
      console.log(`  - Icon #${iconId} (${iconName}): ${error}`);
    });
  }

  if (isDryRun) {
    console.log();
    console.log('⚠️  This was a DRY RUN. No changes were made.');
    console.log('Run without --dry-run to perform the actual migration.');
  } else if (!deleteOld) {
    console.log();
    console.log('ℹ️  Old files were kept in the icons/ folder.');
    console.log('You can manually delete them after verifying the migration.');
    console.log('Or run with --delete-old to automatically delete old files.');
  }

  console.log('='.repeat(60));
}

// Run migration
migrateIcons()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
