-- Migration 1277: allow standalone Smart Disclosure intake links
ALTER TABLE intake_links
  MODIFY COLUMN form_type
    ENUM(
      'intake',
      'public_form',
      'job_application',
      'medical_records_request',
      'smart_school_roi',
      'smart_registration',
      'internal_preferences',
      'life_balance_wheel',
      'assessment',
      'evaluation',
      'smart_disclosure'
    )
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci
    NOT NULL
    DEFAULT 'intake';
