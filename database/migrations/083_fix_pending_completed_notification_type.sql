-- Migration: Fix pending_completed notification type
-- Description: Add pending_completed back to the notifications.type enum (it was missing in later migrations)

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
    'passwordless_token_expired',
    'pending_completed'
) NOT NULL;
