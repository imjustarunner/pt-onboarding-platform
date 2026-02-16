-- Agency announcements: anniversary settings + targeted/splash scheduled announcements.

ALTER TABLE agency_announcements
  ADD COLUMN anniversary_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER birthday_template,
  ADD COLUMN anniversary_template VARCHAR(255) NULL AFTER anniversary_enabled;

ALTER TABLE agency_scheduled_announcements
  ADD COLUMN display_type ENUM('announcement', 'splash') NOT NULL DEFAULT 'announcement' AFTER message,
  ADD COLUMN recipient_user_ids JSON NULL AFTER display_type;

-- Ensure canonical platform profile date fields exist for automation.
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT
  'start_date', 'Start Date', 'date', NULL, FALSE, TRUE, NULL, NULL, 0, NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM user_info_field_definitions
  WHERE field_key = 'start_date'
    AND is_platform_template = TRUE
    AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT
  'date_of_birth', 'Birthdate', 'date', NULL, FALSE, TRUE, NULL, NULL, 0, NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM user_info_field_definitions
  WHERE field_key = 'date_of_birth'
    AND is_platform_template = TRUE
    AND agency_id IS NULL
);
