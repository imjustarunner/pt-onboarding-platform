-- Signed no-show declarations remain distinct from the later financial outcome.
-- No existing attendance, signed notes, package ledgers or notices are changed.
CREATE TABLE appointment_no_show_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  declared_by_user_id INT NOT NULL,
  declared_at DATETIME(3) NOT NULL,
  notify_at DATETIME(3) NOT NULL,
  previous_status VARCHAR(64) NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'pending',
  snapshot_json JSON NOT NULL,
  result_json JSON NULL,
  undone_by_user_id INT NULL,
  undone_at DATETIME(3) NULL,
  UNIQUE KEY uq_no_show_appointment(appointment_id),
  KEY idx_no_show_due(state,notify_at,agency_id)
);
CREATE TABLE appointment_no_show_review_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  review_id BIGINT UNSIGNED NOT NULL,
  appointment_id INT NOT NULL,
  agency_id INT NOT NULL,
  actor_user_id INT NULL,
  actor_type VARCHAR(24) NOT NULL,
  action VARCHAR(64) NOT NULL,
  metadata_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_no_show_review_events(review_id,id)
);
