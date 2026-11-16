-- Removing a setup entry preserves its source details and all external enrollment history.
ALTER TABLE medical_payer_setup_requests
  ADD COLUMN archived_at DATETIME NULL,
  ADD COLUMN archived_by_user_id INT NULL;
CREATE TABLE IF NOT EXISTS medical_payer_setup_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  request_id BIGINT NOT NULL,
  actor_user_id INT NOT NULL,
  action VARCHAR(32) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_payer_setup_events (agency_id,request_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
