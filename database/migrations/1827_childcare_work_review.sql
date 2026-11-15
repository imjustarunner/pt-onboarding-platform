-- Work approval is separate from clocking, compensation agreements and payroll approval.
ALTER TABLE childcare_service_grants ADD COLUMN approve_work BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS childcare_work_reviews (
  shift_id INT NOT NULL, user_id INT NOT NULL, status VARCHAR(20) NOT NULL,
  snapshot_hash CHAR(64) NOT NULL, submitted_at DATETIME(3) NOT NULL,
  reviewed_by_user_id INT NULL, reviewed_at DATETIME(3) NULL, review_note VARCHAR(2000) NULL,
  PRIMARY KEY(shift_id,user_id), INDEX childcare_review_queue(status,shift_id),
  FOREIGN KEY (shift_id) REFERENCES childcare_shifts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS childcare_time_corrections (
  id INT AUTO_INCREMENT PRIMARY KEY, shift_id INT NOT NULL, user_id INT NOT NULL,
  intervals_json JSON NOT NULL, actual_children INT NOT NULL, reason VARCHAR(2000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', request_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_by_user_id INT NULL, reviewed_at DATETIME(3) NULL, review_note VARCHAR(2000) NULL,
  UNIQUE KEY childcare_time_request(shift_id,user_id,request_key),
  INDEX childcare_time_review(shift_id,user_id,status,id),
  FOREIGN KEY (shift_id) REFERENCES childcare_shifts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Existing unapproved shift drafts now require the same separate work review.
-- Approved/paid earnings, original punches and agreed rates remain unchanged.
UPDATE payroll_time_claims
SET status='deferred',
    payload_json=JSON_SET(COALESCE(payload_json,JSON_OBJECT()),
      '$.childcareWorkApprovalRequired',CAST('true' AS JSON),
      '$.childcareWorkApproved',CAST('false' AS JSON),
      '$.childcareWorkReviewedBy',NULL)
WHERE claim_type='childcare_shift' AND status IN ('submitted','deferred')
  AND JSON_EXTRACT(payload_json,'$.childcareWorkApprovalRequired') IS NULL;
