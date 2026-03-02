-- Migration: Add dashboard_view and admin_dashboard_view to user_activity_log action_type
-- Description: Fix "Data truncated for column 'action_type'" when logging dashboard views

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
    'password_reset_link_sent',
    'dashboard_view',
    'admin_dashboard_view'
) NOT NULL;
