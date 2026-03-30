-- Summit Stats Challenge: treadmill proof + manager review/edit controls

ALTER TABLE challenge_workouts
  ADD COLUMN is_treadmill TINYINT(1) NOT NULL DEFAULT 0 AFTER activity_type,
  ADD COLUMN reported_distance_value DECIMAL(7,2) NULL AFTER distance_value,
  ADD COLUMN verified_distance_value DECIMAL(7,2) NULL AFTER reported_distance_value,
  ADD COLUMN proof_status ENUM('not_required','pending','approved','rejected') NOT NULL DEFAULT 'not_required' AFTER verified_distance_value,
  ADD COLUMN proof_review_note VARCHAR(255) NULL AFTER proof_status,
  ADD COLUMN proof_reviewed_by_user_id INT NULL AFTER proof_review_note,
  ADD COLUMN proof_reviewed_at DATETIME NULL AFTER proof_reviewed_by_user_id;
