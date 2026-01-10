-- Migration: Add muted_until field to notifications table
-- Description: Allow notifications to be muted for 48 hours when marked as read

ALTER TABLE notifications
ADD COLUMN muted_until TIMESTAMP NULL COMMENT 'Notification muted until this timestamp (48 hours from read_at)';

-- Add index for efficient querying
CREATE INDEX idx_muted_until ON notifications(muted_until);
