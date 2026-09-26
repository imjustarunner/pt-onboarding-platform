-- Directory capabilities are not provider enrollment or network participation.
CREATE TABLE IF NOT EXISTS medical_payer_setup_details (
  request_id BIGINT NOT NULL PRIMARY KEY,
  source_payer_id VARCHAR(32) NULL,
  claimmd_payer_id VARCHAR(32) NULL,
  directory_name VARCHAR(180) NULL,
  directory_status VARCHAR(32) NOT NULL DEFAULT 'needs_review',
  directory_snapshot_json JSON NULL,
  source_names_json JSON NULL,
  review_note VARCHAR(1500) NULL,
  directory_checked_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payer_setup_details_request FOREIGN KEY (request_id)
    REFERENCES medical_payer_setup_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
