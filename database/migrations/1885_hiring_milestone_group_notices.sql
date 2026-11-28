-- The rollout timestamp prevents historical signatures from generating mail.
CREATE TABLE IF NOT EXISTS hiring_milestone_rollout (
  id TINYINT PRIMARY KEY,
  started_at DATETIME(6) NOT NULL
);
INSERT IGNORE INTO hiring_milestone_rollout (id, started_at) VALUES (1, UTC_TIMESTAMP(6));
CREATE TABLE IF NOT EXISTS hiring_milestone_group_notices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  candidate_user_id INT NOT NULL,
  task_id INT NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  event_key VARCHAR(128) NOT NULL,
  department VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  communication_id INT NULL,
  sender_identity_id INT NULL,
  recipient_address VARCHAR(254) NULL,
  review_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY milestone_department (agency_id, event_key, department),
  INDEX milestone_delivery (status, id)
);
