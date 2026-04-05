-- Summit Stats Team Challenge: per-weekly-challenge proof policy + confidence metadata

ALTER TABLE challenge_weekly_tasks
  ADD COLUMN proof_policy VARCHAR(32) NOT NULL DEFAULT 'none' AFTER description,
  ADD COLUMN confidence_score DECIMAL(5,2) NULL AFTER proof_policy,
  ADD COLUMN confidence_notes VARCHAR(255) NULL AFTER confidence_score;
