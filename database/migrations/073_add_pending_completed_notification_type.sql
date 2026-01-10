-- Migration: Add pending_completed notification type
-- Description: Add notification type for pending user completion

ALTER TABLE notifications
MODIFY COLUMN type ENUM('status_expired', 'temp_password_expired', 'task_overdue', 'onboarding_completed', 'invitation_expired', 'pending_completed') NOT NULL;
