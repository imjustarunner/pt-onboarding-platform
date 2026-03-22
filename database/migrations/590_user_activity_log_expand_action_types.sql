-- Migration: Expand user_activity_log.action_type for app-allowed audit actions
-- Description: Fixes "Data truncated for column 'action_type'" when logging admin_page_view,
--              audit_center_viewed, intake flows, and AI helper actions (backend whitelist in activityLog.service.js).

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
    'admin_dashboard_view',
    'intake_approval',
    'public_intake_login_help',
    'audit_center_viewed',
    'admin_page_view',
    'note_aid_execute',
    'agent_assist',
    'agent_tool_execute'
) NOT NULL;
