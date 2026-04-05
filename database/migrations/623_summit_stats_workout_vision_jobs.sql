-- Summit Stats Team Challenge: async Google Vision processing queue for workouts

CREATE TABLE IF NOT EXISTS challenge_workout_vision_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workout_id INT NOT NULL,
  learning_class_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('queued','processing','completed','failed','skipped') NOT NULL DEFAULT 'queued',
  provider VARCHAR(64) NOT NULL DEFAULT 'google_vision',
  request_json JSON NULL,
  response_json JSON NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workout_vision_jobs_class_status (learning_class_id, status),
  INDEX idx_workout_vision_jobs_workout (workout_id),
  CONSTRAINT fk_workout_vision_jobs_workout
    FOREIGN KEY (workout_id) REFERENCES challenge_workouts(id) ON DELETE CASCADE,
  CONSTRAINT fk_workout_vision_jobs_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_workout_vision_jobs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
