-- Migration: Shift-based program call-offs
-- Description: program_shift_calloffs for call-off with SMS to on-call staff

CREATE TABLE IF NOT EXISTS program_shift_calloffs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shift_signup_id INT NOT NULL,
  user_id INT NOT NULL,
  reason TEXT NULL,
  calloff_at DATETIME NOT NULL,
  status ENUM('pending','covered','uncovered') NOT NULL DEFAULT 'pending',
  covered_by_user_id INT NULL,
  covered_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_calloffs_signup
    FOREIGN KEY (shift_signup_id) REFERENCES program_shift_signups(id) ON DELETE CASCADE,
  CONSTRAINT fk_calloffs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_calloffs_covered_by
    FOREIGN KEY (covered_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_calloffs_signup (shift_signup_id),
  INDEX idx_calloffs_status (status),
  INDEX idx_calloffs_calloff_at (calloff_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
