-- Migration: Add user activity notification types
-- Description: Add notification types for first login (pending and regular) and password changes

-- Add new notification types to the enum
ALTER TABLE notifications
MODIFY COLUMN type ENUM(
    'status_expired', 
    'temp_password_expired', 
    'task_overdue', 
    'onboarding_completed', 
    'invitation_expired',
    'first_login_pending',
    'first_login',
    'password_changed'
) NOT NULL;
