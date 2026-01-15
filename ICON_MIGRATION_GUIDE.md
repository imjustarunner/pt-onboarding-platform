# Icon Migration Guide

This guide explains how to migrate existing icons from the old `icons/` folder to the new `uploads/icons/` folder for better bucket organization.

## Overview

The system now stores icons in `uploads/icons/` instead of `icons/`. The code has backward compatibility built in, so old icons will continue to work. However, for better organization, you can migrate them to the new location.

## Migration Steps

### 1. Create the New Folder Structure

First, create the new folders in your GCS bucket:
- `uploads/icons/` - for new icons
- `uploads/logos/` - for new logos

You can do this manually in the GCS console, or the folders will be created automatically when you upload the first file.

### 2. Test the Migration (Dry Run)

Run the migration script in dry-run mode to see what would be migrated:

```bash
cd backend
npm run migrate-icons -- --dry-run
```

This will:
- Show all icons that would be migrated
- Display old and new paths
- **Not make any changes** (safe to run)

### 3. Perform the Migration

Once you're satisfied with the dry-run results, run the actual migration:

```bash
npm run migrate-icons
```

This will:
- Copy all icons from `icons/` to `uploads/icons/`
- Update the database `file_path` column
- **Keep the old files** (safe - you can delete them later)

### 4. Verify the Migration

After migration:
1. Check that icons still display correctly in the app
2. Verify new icons are being saved to `uploads/icons/`
3. Check the database to confirm `file_path` values are updated

### 5. (Optional) Delete Old Files

If everything looks good, you can delete the old files:

```bash
npm run migrate-icons -- --delete-old
```

**OR** manually delete the `icons/` folder in GCS after verifying everything works.

## Migration Script Options

```bash
# Dry run (no changes)
npm run migrate-icons -- --dry-run

# Migrate and keep old files (recommended first step)
npm run migrate-icons

# Migrate and delete old files (after verification)
npm run migrate-icons -- --delete-old

# Combine options
npm run migrate-icons -- --dry-run --delete-old
```

## What Gets Migrated

The script finds all icons in the database where:
- `file_path` starts with `icons/`
- `file_path` does NOT start with `uploads/`

It will:
1. Copy the file from `icons/filename.png` → `uploads/icons/filename.png`
2. Update the database: `file_path = 'uploads/icons/filename.png'`
3. Optionally delete the old file

## Safety Features

- **Dry-run mode**: Test without making changes
- **Backward compatibility**: Old icons continue to work even if not migrated
- **Error handling**: Script continues even if individual icons fail
- **Verification**: Checks if files exist before copying
- **No data loss**: Old files are kept by default

## Troubleshooting

### "File not found" errors
- The old file might have been manually deleted
- Check GCS bucket to verify file exists
- These icons will be skipped (not migrated)

### "New file already exists"
- The icon was already migrated
- Database will be updated to point to new location
- Safe to ignore

### Database connection errors
- Ensure `.env` file has correct database credentials
- Check that the database is accessible

## Rollback

If something goes wrong:
1. The old files are still in `icons/` (unless you used `--delete-old`)
2. You can manually update the database to revert `file_path` values
3. Or restore from a database backup

## After Migration

Once migration is complete:
- New icons will automatically go to `uploads/icons/`
- Old icons in `icons/` can be safely deleted
- The system will work with both locations during transition
- Eventually, you can remove the old `icons/` folder

## Questions?

If you encounter any issues:
1. Run with `--dry-run` first to see what would happen
2. Check the console output for specific error messages
3. Verify GCS bucket permissions and connectivity
