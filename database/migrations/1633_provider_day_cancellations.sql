-- Reviewed, resumable provider-day cancellations. Each appointment still uses its signed workflow.
CREATE TABLE IF NOT EXISTS provider_day_cancellations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  token CHAR(36) NOT NULL,
  provider_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  cancellation_date DATE NOT NULL,
  plan_json JSON NOT NULL,
  results_json JSON NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'preview',
  signed_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_day_cancellation_token (token),
  KEY idx_provider_day_cancellation_history (provider_id, cancellation_date)
);
