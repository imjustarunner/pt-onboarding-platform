ALTER TABLE challenge_workouts ADD COLUMN manager_edited_by_user_id INT NULL DEFAULT NULL;
ALTER TABLE challenge_workouts ADD COLUMN manager_edited_at DATETIME NULL DEFAULT NULL;
