-- Migration 1191: structured job description sections (About / Responsibilities / Qualifications / Benefits)
ALTER TABLE hiring_job_descriptions
  ADD COLUMN description_sections_json JSON NULL
  COMMENT 'Structured JD: aboutTheRole, responsibilities[], qualifications[], benefits[]';
