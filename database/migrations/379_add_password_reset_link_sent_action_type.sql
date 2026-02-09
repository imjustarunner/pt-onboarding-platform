-- Migration: Add password_reset_link_sent to user_activity_log action_type
-- Description: Allow activity log to record when an admin sends a password reset link

ALTER TABLE user_activity_log
MODIFY COLUMN action_type ENUM(
    'login',
    'logout',
    'timeout',
    'page_view',
    'api_call',
    'password_change',
    'module_start',
    'module_end',
    'module_complete',
    'page_navigation',
    'password_reset_link_sent'
) NOT NULL;
