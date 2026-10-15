CREATE TABLE IF NOT EXISTS supervision_time_corrections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  requested_by_user_id INT NOT NULL,
  reviewed_by_user_id INT NULL,
  request_key VARCHAR(80) NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  total_seconds INT NOT NULL,
  reason VARCHAR(2000) NOT NULL,
  modality VARCHAR(30) NOT NULL,
  previous_record_json JSON NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  INDEX idx_supervision_correction_history (session_id, user_id, id),
  UNIQUE KEY uniq_supervision_correction_request (session_id, user_id, request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE supervision_session_attendance_rollups ADD COLUMN manual_correction_id BIGINT UNSIGNED NULL;
