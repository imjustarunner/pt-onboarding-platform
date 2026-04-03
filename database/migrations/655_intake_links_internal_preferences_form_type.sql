-- Expand intake_links.form_type ENUM to include internal_preferences.
-- internal_preferences links are agency-scoped and allow staff to update
-- their own user_preferences via a shareable public link without logging in.

ALTER TABLE intake_links
  MODIFY COLUMN form_type
    ENUM('intake', 'public_form', 'job_application', 'medical_records_request', 'smart_school_roi', 'smart_registration', 'internal_preferences')
    NOT NULL DEFAULT 'intake';
