/*
Idempotency lock table for learning subscription renewals.
Ensures one renewal execution per (subscription, period_end_at).
*/

CREATE TABLE IF NOT EXISTS learning_subscription_renewal_locks (
  id BIGINT NOT NULL AUTO_INCREMENT,
  subscription_id BIGINT NOT NULL,
  period_end_at DATETIME NOT NULL,
  lock_key VARCHAR(128) NOT NULL,
  status ENUM('RUNNING','COMPLETED','FAILED','SKIPPED') NOT NULL DEFAULT 'RUNNING',
  runner_id VARCHAR(128) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  result_json JSON NULL,
  error_message TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_sub_renewal_lock (subscription_id, period_end_at),
  UNIQUE KEY uq_learning_sub_renewal_lock_key (lock_key),
  KEY idx_learning_sub_renewal_status_started (status, started_at),
  CONSTRAINT fk_learning_sub_renewal_lock_sub
    FOREIGN KEY (subscription_id) REFERENCES learning_subscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
