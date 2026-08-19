-- Migration 1249: Onboarding credential packet fields (Lifecycle + employee portal)
-- Replaces the Google Doc checklist for accounts & access credentials.

-- ── Staff-entered credential fields (user_info_values) ───────────────────────
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'grasshopper_login', 'Grasshopper Login', 'text', NULL, FALSE, TRUE, NULL, NULL, 210, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'grasshopper_login' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'grasshopper_extension', 'Grasshopper Extension', 'text', NULL, FALSE, TRUE, NULL, NULL, 220, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'grasshopper_extension' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'grasshopper_pin', 'Grasshopper PIN', 'text', NULL, FALSE, TRUE, NULL, NULL, 230, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'grasshopper_pin' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'therapynotes_login', 'TherapyNotes Username', 'text', NULL, FALSE, TRUE, NULL, NULL, 240, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'therapynotes_login' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'therapynotes_temp_password', 'TherapyNotes Temp Password', 'text', NULL, FALSE, TRUE, NULL, NULL, 250, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'therapynotes_temp_password' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'workspace_temp_password', 'Workspace Temp Password', 'text', NULL, FALSE, TRUE, NULL, NULL, 260, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'workspace_temp_password' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'lifecycle_npi_number', 'NPI Number', 'text', NULL, FALSE, TRUE, NULL, NULL, 270, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'lifecycle_npi_number' AND agency_id IS NULL
);

-- ── Employee portal acknowledgements ─────────────────────────────────────────
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'portal_identity_confirmed', 'Portal Identity Confirmed', 'text', NULL, FALSE, TRUE, NULL, NULL, 280, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'portal_identity_confirmed' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'portal_acked_email', 'Logged into Email (portal)', 'text', NULL, FALSE, TRUE, NULL, NULL, 290, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'portal_acked_email' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'portal_acked_grasshopper', 'Logged into Grasshopper (portal)', 'text', NULL, FALSE, TRUE, NULL, NULL, 300, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'portal_acked_grasshopper' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'portal_acked_therapynotes', 'Logged into TherapyNotes (portal)', 'text', NULL, FALSE, TRUE, NULL, NULL, 310, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'portal_acked_therapynotes' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'therapynotes_temp_password_revealed', 'TherapyNotes Temp Password Revealed', 'text', NULL, FALSE, TRUE, NULL, NULL, 320, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'therapynotes_temp_password_revealed' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'workspace_temp_password_revealed', 'Workspace Temp Password Revealed', 'text', NULL, FALSE, TRUE, NULL, NULL, 330, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'workspace_temp_password_revealed' AND agency_id IS NULL
);

-- Wire checklist items to fields so Lifecycle sync auto-completes them
UPDATE lifecycle_checklist_definitions
SET integration_type = 'user_info_field',
    integration_ref = 'grasshopper_login'
WHERE item_key = 'grasshopper_login'
  AND (integration_type IS NULL OR integration_type = 'manual' OR integration_ref IS NULL OR integration_ref = '');

UPDATE lifecycle_checklist_definitions
SET integration_type = 'user_info_field',
    integration_ref = 'portal_acked_email'
WHERE item_key = 'logged_into_email';
