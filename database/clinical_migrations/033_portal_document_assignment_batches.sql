-- Keep each staff assignment atomic and safe to retry without duplicate forms.
CREATE TABLE IF NOT EXISTS clinical_form_assignment_batches (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, client_id, actor_user_id, request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
