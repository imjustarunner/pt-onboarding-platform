-- When set, leaderboards and record views show an anonymous label for this workout row
-- (club/season totals and miles are unchanged).
ALTER TABLE challenge_workouts
  ADD COLUMN contributor_anonymized_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'User requested anonymity for this row in club-facing views (stats retained)'
  AFTER created_at;
