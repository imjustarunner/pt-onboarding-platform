-- Migration 1347: allow file field_type for resume/headshot module form uploads
ALTER TABLE user_info_field_definitions
  MODIFY COLUMN field_type
  ENUM(
    'text',
    'number',
    'date',
    'email',
    'phone',
    'select',
    'multi_select',
    'textarea',
    'boolean',
    'file'
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- Promote known upload fields that were previously stored as text
UPDATE user_info_field_definitions
SET field_type = 'file'
WHERE field_type = 'text'
  AND (
    field_key IN ('resume_cv_upload', 'headshot_upload', 'license_upload')
    OR field_key LIKE '%upload%'
  );
