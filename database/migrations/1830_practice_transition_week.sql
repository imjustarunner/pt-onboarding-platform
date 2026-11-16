-- Additive rollout evidence only. No users, senders, claims or access are activated.
CREATE TABLE IF NOT EXISTS practice_transition_weeks (
  agency_id INT NOT NULL,
  week_start DATE NOT NULL,
  revision INT NOT NULL DEFAULT 0,
  payload_json JSON NOT NULL,
  updated_by_user_id INT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (agency_id, week_start)
);

CREATE TABLE IF NOT EXISTS practice_transition_week_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  week_start DATE NOT NULL,
  revision INT NOT NULL,
  actor_user_id INT NOT NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY transition_event_revision (agency_id, week_start, revision)
);

CREATE TABLE IF NOT EXISTS sms_phone_enrollments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  scope_key VARCHAR(80) NOT NULL,
  phone_hash CHAR(64) NOT NULL,
  phone_last_four CHAR(4) NOT NULL,
  number_id INT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  command_at BIGINT NOT NULL,
  payload_json JSON NOT NULL,
  linked_user_id INT NULL,
  linked_client_id INT NULL,
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME(3) NULL,
  UNIQUE KEY phone_enrollment_scope (agency_id, scope_key, phone_hash),
  KEY phone_enrollment_review (agency_id, status, id)
);

CREATE TABLE IF NOT EXISTS sms_phone_enrollment_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enrollment_id BIGINT NOT NULL,
  event_key CHAR(64) NOT NULL,
  keyword VARCHAR(8) NOT NULL,
  command_at BIGINT NOT NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY phone_enrollment_carrier_event (event_key),
  KEY phone_enrollment_history (enrollment_id, id)
);
