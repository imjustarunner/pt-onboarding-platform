-- Reference email open tracking + user_activity_log action type for hiring reference lifecycle.

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
    'agent_tool_execute',
    'hiring_reference_event'
) NOT NULL;

ALTER TABLE hiring_reference_requests
  ADD COLUMN open_track_token VARCHAR(32) NULL COMMENT 'Opaque token for optional email open pixel (first-open only)',
  ADD COLUMN email_opened_at TIMESTAMP NULL DEFAULT NULL,
  ADD UNIQUE KEY uq_hiring_ref_open_track (open_track_token);
