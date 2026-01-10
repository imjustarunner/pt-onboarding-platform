-- Migration: Add expired passwordless token notification type
-- Description: Add notification type for expired passwordless tokens

-- Add new notification type to the enum
ALTER TABLE notifications
MODIFY COLUMN type ENUM(
    'status_expired', 
    'temp_password_expired', 
    'task_overdue', 
    'onboarding_completed', 
    'invitation_expired',
    'first_login_pending',
    'first_login',
    'password_changed',
    'passwordless_token_expired'
) NOT NULL;
