-- Standalone NoteWorthy only. Existing practices are not silently enrolled in
-- a new automatic-deletion policy; new practices explicitly accept it.
ALTER TABLE noteworthy_practices
  ADD COLUMN trial_policy_version INT NOT NULL DEFAULT 0,
  ADD COLUMN trial_policy_accepted_at DATETIME NULL,
  ADD COLUMN trial_started_at DATETIME NULL,
  ADD COLUMN trial_ends_at DATETIME NULL,
  ADD COLUMN retention_days INT NOT NULL DEFAULT 0,
  ADD COLUMN continuation_requested_at DATETIME NULL,
  ADD COLUMN commercial_activated_at DATETIME NULL,
  ADD COLUMN commercial_evidence_enc LONGTEXT NULL,
  ADD COLUMN deletion_requested_at DATETIME NULL,
  ADD COLUMN deleted_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS noteworthy_contact_threads (
  id CHAR(36) NOT NULL PRIMARY KEY,
  agency_id INT NULL,
  owner_user_id INT NULL,
  support_ticket_id INT NOT NULL,
  email_hash CHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  contact_enc LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX noteworthy_contact_agency(agency_id),
  INDEX noteworthy_contact_email(email_hash),
  FOREIGN KEY (agency_id) REFERENCES noteworthy_practices(agency_id),
  FOREIGN KEY (support_ticket_id) REFERENCES support_tickets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS noteworthy_message_receipts (
  thread_id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  PRIMARY KEY(thread_id,request_id),
  FOREIGN KEY(thread_id) REFERENCES noteworthy_contact_threads(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Durable deletion jobs retain encrypted object keys until object removal
-- succeeds. A failed cleanup is retried and is never reported as completed.
CREATE TABLE IF NOT EXISTS noteworthy_deletion_jobs (
  agency_id INT NOT NULL PRIMARY KEY,
  status ENUM('queued','processing','retry','completed','review_required') NOT NULL DEFAULT 'queued',
  requested_by_user_id INT NULL,
  reason VARCHAR(40) NOT NULL,
  object_manifest_enc LONGTEXT NULL,
  attempts INT NOT NULL DEFAULT 0,
  error_code VARCHAR(80) NULL,
  deleted_row_count BIGINT NOT NULL DEFAULT 0,
  deleted_object_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  FOREIGN KEY (agency_id) REFERENCES noteworthy_practices(agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
