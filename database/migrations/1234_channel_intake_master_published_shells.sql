-- Migration 1234: published Join shells for channel masters (tutoring intake/assessment/evaluation)
ALTER TABLE agency_channel_intake_masters
  ADD COLUMN published_intake_link_id INT NULL
    COMMENT 'Active Join shell for this channel (usually form_type=intake)'
    AFTER editor_intake_link_id;

ALTER TABLE agency_channel_intake_masters
  ADD COLUMN published_link_ids JSON NULL
    COMMENT 'Map of form_type -> intake_links.id for intake, assessment, and evaluation'
    AFTER published_intake_link_id;

ALTER TABLE agency_channel_intake_masters
  ADD KEY idx_agency_channel_intake_masters_published (published_intake_link_id);

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
      'evaluation'
    )
    NOT NULL DEFAULT 'intake';
