-- Migration: Convert notifications.type from ENUM to VARCHAR(50)
-- Description: Convert notification type from ENUM to VARCHAR to avoid migration issues with ENUM modifications
-- This allows notification types to be managed in application code rather than database schema
-- This migration is idempotent and safe to run on both fresh and existing databases

-- Step 1: Normalize any NULL or invalid type values to 'status_expired' (safe fallback)
-- This handles any edge cases before conversion
UPDATE notifications 
SET type = 'status_expired' 
WHERE type IS NULL 
   OR type NOT IN (
     'status_expired', 
     'temp_password_expired', 
     'task_overdue', 
     'onboarding_completed', 
     'invitation_expired',
     'first_login_pending',
     'first_login',
     'password_changed',
     'passwordless_token_expired',
     'pending_completed',
     'checklist_incomplete'
   );

-- Step 2: Convert ENUM to VARCHAR(50) NOT NULL
-- This will preserve all existing valid values and allow future types to be added in code
ALTER TABLE notifications
MODIFY COLUMN type VARCHAR(50) NOT NULL;

-- Note: After this migration, notification type validation is enforced in:
--   - backend/src/models/Notification.model.js (Notification.create method)
-- This ensures type safety at the application layer while maintaining database flexibility
