-- Migration 1271: Roster background-check fingerprint + credentialing date profile fields
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'provider_fingerprint_date', 'Fingerprinting Date', 'date', NULL, FALSE, TRUE, NULL, NULL, 340, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'provider_fingerprint_date' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
SELECT 'credentialing_date', 'Credentialing Date', 'date', NULL, FALSE, TRUE, NULL, NULL, 350, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions
  WHERE field_key = 'credentialing_date' AND agency_id IS NULL
);
