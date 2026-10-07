-- One support ticket per submitted phone follow-up, including request retries.
CREATE TABLE IF NOT EXISTS phone_followup_tickets (
 agency_id INT NOT NULL,
 request_key CHAR(36) NOT NULL,
 request_digest CHAR(64) NOT NULL,
 ticket_id INT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (agency_id, request_key),
 KEY idx_phone_followup_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
