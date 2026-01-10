-- Add people_ops_term column to platform_branding table
-- Note: The migration script will catch "Duplicate column" errors and skip them
ALTER TABLE platform_branding
ADD COLUMN people_ops_term VARCHAR(100) NULL DEFAULT NULL;
