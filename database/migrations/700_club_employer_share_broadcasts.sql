-- Club manager → employer agency “share club with staff” prompts

CREATE TABLE IF NOT EXISTS club_employer_share_broadcasts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  club_id INT NOT NULL,
  employer_agency_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_cesb_employer_active (employer_agency_id, revoked_at),
  INDEX idx_cesb_club (club_id),
  CONSTRAINT fk_cesb_club FOREIGN KEY (club_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_cesb_employer FOREIGN KEY (employer_agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_cesb_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS club_employer_share_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  broadcast_id INT NOT NULL,
  user_id INT NOT NULL,
  action ENUM('join', 'dismiss', 'never') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_cesr_broadcast_user (broadcast_id, user_id),
  INDEX idx_cesr_user (user_id),
  CONSTRAINT fk_cesr_broadcast FOREIGN KEY (broadcast_id) REFERENCES club_employer_share_broadcasts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cesr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
