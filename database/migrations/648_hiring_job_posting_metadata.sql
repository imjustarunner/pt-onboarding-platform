ALTER TABLE hiring_job_descriptions
  ADD COLUMN posted_date DATE NULL,
  ADD COLUMN application_deadline DATE NULL,
  ADD COLUMN city VARCHAR(120) NULL,
  ADD COLUMN state VARCHAR(120) NULL,
  ADD COLUMN education_level VARCHAR(80) NULL;
