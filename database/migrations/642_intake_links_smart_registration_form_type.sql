-- Expand intake_links.form_type ENUM to include smart_registration.
-- smart_registration links are agency-scoped, tied to a company_event, and
-- use the registration step to enroll existing staff/attendees into an event.

ALTER TABLE intake_links
  MODIFY COLUMN form_type
    ENUM('intake', 'public_form', 'job_application', 'medical_records_request', 'smart_school_roi', 'smart_registration')
    NOT NULL DEFAULT 'intake';
