CREATE TABLE IF NOT EXISTS client_after_hours_self_pay_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  request_mode ENUM('off', 'weekend_self_pay', 'after_insurance_denial') NOT NULL,
  proposed_amount_cents INT UNSIGNED NULL,
  provider_attested_at DATETIME NULL,
  requested_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_after_hours_client (agency_id, client_id, id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id)
) ENGINE=InnoDB;
