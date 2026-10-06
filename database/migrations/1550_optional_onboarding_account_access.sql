-- Account delivery preferences. No external account is provisioned by these flags.
-- Missing preferences retain existing credential visibility for legacy employees.
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'workspace_access_enabled', 'Google Workspace / SSO access enabled', 'text', NULL, FALSE, TRUE, NULL, NULL, 340, NULL
WHERE NOT EXISTS (SELECT 1 FROM user_info_field_definitions WHERE field_key = 'workspace_access_enabled' AND agency_id IS NULL);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'therapynotes_access_enabled', 'TherapyNotes access enabled', 'text', NULL, FALSE, TRUE, NULL, NULL, 350, NULL
WHERE NOT EXISTS (SELECT 1 FROM user_info_field_definitions WHERE field_key = 'therapynotes_access_enabled' AND agency_id IS NULL);
