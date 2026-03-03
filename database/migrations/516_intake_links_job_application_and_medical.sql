-- Add job application and medical records form types.
-- job_application: each job gets its own link, creates hiring candidate, uploads go to candidate.
-- medical_records_request: submissions dump in documents submitted section, not assignable.
ALTER TABLE intake_links
  MODIFY COLUMN form_type ENUM('intake', 'public_form', 'job_application', 'medical_records_request') NOT NULL DEFAULT 'intake';

-- Link to job for application forms (one link per job)
ALTER TABLE intake_links ADD COLUMN job_description_id INT NULL AFTER program_id;
ALTER TABLE intake_links ADD INDEX idx_intake_links_job (job_description_id);
ALTER TABLE intake_links ADD CONSTRAINT fk_intake_links_job FOREIGN KEY (job_description_id) REFERENCES hiring_job_descriptions(id) ON DELETE CASCADE;

-- When false, documents land in "submitted" section only (no assign to client). Used for medical records.
ALTER TABLE intake_links ADD COLUMN requires_assignment TINYINT(1) NOT NULL DEFAULT 1 AFTER create_guardian;
