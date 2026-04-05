-- Summit Stats Team Challenge: workout comments and media uploads (GIF supported)

CREATE TABLE IF NOT EXISTS challenge_workout_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workout_id INT NOT NULL,
  learning_class_id INT NOT NULL,
  user_id INT NOT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workout_comments_workout_created (workout_id, created_at),
  INDEX idx_workout_comments_class (learning_class_id),
  CONSTRAINT fk_workout_comments_workout
    FOREIGN KEY (workout_id) REFERENCES challenge_workouts(id) ON DELETE CASCADE,
  CONSTRAINT fk_workout_comments_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_workout_comments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS challenge_workout_media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workout_id INT NOT NULL,
  learning_class_id INT NOT NULL,
  user_id INT NOT NULL,
  media_type ENUM('gif','image') NOT NULL DEFAULT 'image',
  file_path VARCHAR(1024) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workout_media_workout (workout_id),
  INDEX idx_workout_media_class (learning_class_id),
  CONSTRAINT fk_workout_media_workout
    FOREIGN KEY (workout_id) REFERENCES challenge_workouts(id) ON DELETE CASCADE,
  CONSTRAINT fk_workout_media_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_workout_media_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
