CREATE TABLE IF NOT EXISTS support_reply_review_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  reviewer_user_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  request_key VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  window_start DATETIME(3) NOT NULL,
  window_end DATETIME(3) NOT NULL,
  time_zone VARCHAR(80) NOT NULL,
  counts_json JSON NOT NULL,
  coverage_json JSON NOT NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_review_batch_request (agency_id, request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_reply_review_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NOT NULL,
  agency_id INT NOT NULL,
  ticket_id INT NOT NULL,
  entry_key VARCHAR(100) NOT NULL,
  evidence_encrypted JSON NOT NULL,
  feedback_encrypted JSON NULL,
  actual_rating ENUM('good','acceptable','bad') NULL,
  draft_rating ENUM('good','acceptable','bad') NULL,
  revision INT NOT NULL DEFAULT 0,
  reviewed_at DATETIME(3) NULL,
  updated_by_user_id INT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_review_entry (batch_id, entry_key),
  KEY idx_review_entries_scope (agency_id, batch_id),
  CONSTRAINT fk_review_entry_batch FOREIGN KEY (batch_id) REFERENCES support_reply_review_batches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
