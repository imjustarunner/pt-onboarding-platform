-- Migration 935: staff Benefits tab — employment classification, notes, eligibility overrides
ALTER TABLE users
  ADD COLUMN employment_type VARCHAR(32) NULL DEFAULT NULL
  COMMENT 'HR employment classification: full_time, part_time, contractor, intern, per_diem';

ALTER TABLE users
  ADD COLUMN benefits_notes TEXT NULL
  COMMENT 'Internal HR/admin notes about this employee benefits profile';

ALTER TABLE users
  ADD COLUMN benefits_eligibility_overrides_json JSON NULL
  COMMENT 'Per-benefit eligibility overrides keyed by benefit id (true/false)';
