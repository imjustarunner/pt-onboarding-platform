CREATE TABLE IF NOT EXISTS client_payment_setup_requests (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 client_id INT NOT NULL,
 requested_by_user_id INT NOT NULL,
 request_key VARCHAR(100) NOT NULL,
 review_hash CHAR(64) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'sending',
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 completed_at DATETIME(6) NULL,
 UNIQUE KEY uq_payment_setup_request (agency_id,request_key),
 KEY idx_payment_setup_client (agency_id,client_id,created_at)
);
CREATE TABLE IF NOT EXISTS client_payment_setup_deliveries (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_id BIGINT UNSIGNED NOT NULL,
 recipient_user_id INT NOT NULL,
 recipient_kind VARCHAR(16) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'pending',
 communication_id BIGINT NULL,
 notification_id BIGINT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 completed_at DATETIME(6) NULL,
 UNIQUE KEY uq_payment_setup_recipient (request_id,recipient_user_id,recipient_kind),
 CONSTRAINT fk_payment_setup_request FOREIGN KEY (request_id) REFERENCES client_payment_setup_requests(id)
);
