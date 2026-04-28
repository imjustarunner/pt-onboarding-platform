-- Migration 818: Add featured flag, role type, and display tags to hiring job descriptions
ALTER TABLE hiring_job_descriptions
  ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Pin this job as featured on the public careers page',
  ADD COLUMN role_type VARCHAR(80) NULL
    COMMENT 'Display role category label, e.g. Provider, Facilitator, Intern',
  ADD COLUMN tags_json JSON NULL
    COMMENT 'Array of tag label strings shown on the public careers card, e.g. [\"School-Based\",\"Full-Time\"]';
