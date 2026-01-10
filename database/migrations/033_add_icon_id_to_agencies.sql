-- Migration: Add icon_id to agencies table if it doesn't exist
-- Description: Safely add icon_id column to agencies table
-- Note: This is handled in migration 032, so this migration is now a no-op
-- Keeping file for migration history but column should already exist
-- This migration intentionally does nothing as the column is added in 032

SELECT 1;
