-- Migration: Drop program_id columns
-- Description: Remove program_id from modules and user_progress tables
-- Note: This is split into a separate migration to handle cases where columns may not exist

-- Drop foreign key constraints first
-- Try to drop constraint - if it doesn't exist, migration runner will ignore the error
ALTER TABLE modules DROP FOREIGN KEY modules_ibfk_5;

-- Remove program_id from modules table
ALTER TABLE modules DROP COLUMN program_id;

-- Try to drop foreign key from user_progress (constraint name from migration 008)
ALTER TABLE user_progress DROP FOREIGN KEY user_progress_ibfk_3;

-- Remove program_id from user_progress table  
ALTER TABLE user_progress DROP COLUMN program_id;

