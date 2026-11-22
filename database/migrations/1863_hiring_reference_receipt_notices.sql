-- Queue receipt alerts in the same transaction as the saved reference.
-- No answers or public bearer links belong in this delivery ledger.
CREATE TABLE IF NOT EXISTS hiring_reference_receipt_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, candidate_user_id INT NOT NULL,
 source_kind VARCHAR(16) NOT NULL, source_id INT NOT NULL,
 reference_index INT NOT NULL, initialized TINYINT NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY reference_receipt_source (source_kind, source_id),
 KEY reference_receipt_pending (initialized, id)
);
CREATE TABLE IF NOT EXISTS hiring_reference_receipt_notices (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 event_id BIGINT UNSIGNED NOT NULL, recipient_user_id INT NOT NULL,
 channel VARCHAR(16) NULL, status VARCHAR(24) NOT NULL DEFAULT 'pending',
 notification_id INT NULL, communication_id INT NULL, review_reason VARCHAR(255) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY reference_receipt_recipient (event_id, recipient_user_id),
 KEY reference_notice_pending (status, id)
);
