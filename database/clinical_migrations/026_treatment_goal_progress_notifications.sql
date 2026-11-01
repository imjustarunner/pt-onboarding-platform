-- Goal progress is an observation, not a rewrite of signed plan content.
-- The event and recipient outbox commit in the same clinical transaction as status.
CREATE TABLE IF NOT EXISTS clinical_treatment_goal_progress_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  treatment_plan_id BIGINT NOT NULL,
  service_id INT NULL,
  goal_id BIGINT NOT NULL,
  actor_user_id INT NOT NULL,
  previous_status VARCHAR(40) NOT NULL,
  progress_status VARCHAR(40) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_goal_progress_history (agency_id,client_id,goal_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clinical_treatment_goal_progress_deliveries (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  progress_event_id BIGINT NOT NULL,
  recipient_user_id INT NOT NULL,
  notification_id INT NULL,
  communication_id INT NULL,
  delivery_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  last_error VARCHAR(80) NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_goal_progress_recipient (progress_event_id,recipient_user_id),
  INDEX ix_goal_progress_delivery_due (delivery_status,id),
  CONSTRAINT fk_goal_progress_delivery_event FOREIGN KEY (progress_event_id)
    REFERENCES clinical_treatment_goal_progress_events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
