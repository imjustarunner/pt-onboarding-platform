ALTER TABLE hiring_profiles
  ADD COLUMN references_json JSON NULL,
  ADD COLUMN job_acknowledged TINYINT(1) NOT NULL DEFAULT 0;
