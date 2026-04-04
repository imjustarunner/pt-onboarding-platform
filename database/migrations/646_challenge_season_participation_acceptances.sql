CREATE TABLE IF NOT EXISTS challenge_season_participation_acceptances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  agreement_hash CHAR(64) NOT NULL,
  agreement_snapshot_json JSON NOT NULL,
  signature_name VARCHAR(255) NOT NULL,
  accepted_at DATETIME NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_challenge_participation_acceptance (learning_class_id, provider_user_id, agreement_hash),
  KEY idx_challenge_participation_acceptance_class_user (learning_class_id, provider_user_id),
  CONSTRAINT fk_challenge_participation_acceptance_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_challenge_participation_acceptance_user
    FOREIGN KEY (provider_user_id) REFERENCES users(id)
    ON DELETE CASCADE
);
