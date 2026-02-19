-- Rolling delinquency score for clinical notes: +1 each checkpoint with unpaid notes, -1 when cleared (min 0).
-- Escalate prominence in digest when score >= 2.
CREATE TABLE IF NOT EXISTS user_payroll_delinquency_scores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_agency (user_id, agency_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_agency_score (agency_id, score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
