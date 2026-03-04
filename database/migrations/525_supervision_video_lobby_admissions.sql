-- Track which users have been admitted from lobby to main video room
CREATE TABLE IF NOT EXISTS supervision_session_video_admissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  admitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_session_user (session_id, user_id),
  FOREIGN KEY (session_id) REFERENCES supervision_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
