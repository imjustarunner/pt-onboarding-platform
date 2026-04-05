-- Summit Stats Team Challenge: workout disqualification + richer season casualties metadata

ALTER TABLE challenge_workouts
  ADD COLUMN is_disqualified TINYINT(1) NOT NULL DEFAULT 0 AFTER proof_reviewed_at,
  ADD COLUMN disqualification_reason VARCHAR(255) NULL AFTER is_disqualified,
  ADD COLUMN disqualified_by_user_id INT NULL AFTER disqualification_reason,
  ADD COLUMN disqualified_at DATETIME NULL AFTER disqualified_by_user_id;

ALTER TABLE challenge_eliminations
  MODIFY COLUMN reason ENUM('points_failed', 'challenge_not_completed', 'both', 'manual_boot') NOT NULL,
  ADD COLUMN team_id INT NULL AFTER provider_user_id,
  ADD COLUMN elimination_mode ENUM('auto', 'manual') NOT NULL DEFAULT 'auto' AFTER reason,
  ADD COLUMN public_message TEXT NULL AFTER admin_comment,
  ADD COLUMN created_by_user_id INT NULL AFTER public_message;
