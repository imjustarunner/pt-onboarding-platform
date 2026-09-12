CREATE TABLE practitioner_packet_checkout_attempts (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 packet_id INT NOT NULL,
 agency_id INT NOT NULL,
 package_id INT NOT NULL,
 payment_mode VARCHAR(30) NOT NULL,
 amount_cents INT NOT NULL,
 sessions_purchased INT NOT NULL,
 connected_account_id VARCHAR(128) NOT NULL,
 processor_intent_id VARCHAR(128) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_packet_checkout(packet_id),
 UNIQUE KEY uq_packet_checkout_intent(processor_intent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
