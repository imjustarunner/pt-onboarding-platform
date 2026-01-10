-- Migration: Add pending_completed notification type (NO-OP)
-- Description: This migration originally attempted to add 'pending_completed' to the notifications.type ENUM.
-- However, ENUM modifications cause WARN_DATA_TRUNCATED errors in Cloud SQL when legacy values exist.
-- 
-- Instead, notification types are now managed as VARCHAR(50) starting from migration 080,
-- and validation is enforced at the application layer in backend/src/models/Notification.model.js
--
-- This migration is a no-op to maintain migration sequence integrity.
-- The 'pending_completed' type is included in the application-layer validation.

-- No SQL statements - this migration intentionally does nothing
SELECT 1;
