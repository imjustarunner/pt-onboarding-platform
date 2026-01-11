# Database Migrations

This directory contains SQL migration files that should be run in order to update the database schema.

## Running Migrations

### Option 1: Using the Migration Runner Script (Recommended)

The `run-migrations.js` script automatically tracks which migrations have been run and executes them in order.

```bash
# Run all pending migrations
node database/run-migrations.js

# Dry run (see what would be executed without running)
node database/run-migrations.js --dry-run

# Run a specific migration
node database/run-migrations.js --migration=091
```

**Prerequisites:**
- Node.js installed
- Database connection configured via environment variables:
  - `DB_HOST`
  - `DB_PORT` (or Unix socket path)
  - `DB_NAME`
  - `DB_USER`
  - `DB_PASSWORD`

### Option 2: Manual Execution

You can also run migrations manually using MySQL client:

```bash
# Using Cloud Shell
gcloud sql connect ptonboard-mysql --user=root --project=ptonboard-dev

# Then in MySQL:
USE onboarding_stage;
SOURCE database/migrations/091_add_username_field.sql;
```

### Option 3: Using Cloud SQL Proxy

If you have Cloud SQL Proxy running locally:

```bash
mysql -h 127.0.0.1 -P 3307 -u root -p onboarding_stage < database/migrations/091_add_username_field.sql
```

## Migration Tracking

The migration runner creates a `migrations_log` table to track which migrations have been executed. This prevents running the same migration twice.

To see migration history:
```sql
SELECT * FROM migrations_log ORDER BY executed_at DESC;
```

## Current Migrations

- `091_add_username_field.sql` - Adds username field to users table for mutable username support

## Notes

- Migrations are numbered sequentially (e.g., 091, 092, 093)
- Always backup your database before running migrations in production
- Test migrations in staging first
- Migrations are idempotent where possible (using `IF NOT EXISTS`, etc.)
