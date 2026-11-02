CREATE TABLE IF NOT EXISTS client_exchange_request_notice_queue (
  request_id INT NOT NULL PRIMARY KEY,
  status ENUM('pending','sending','completed','needs_review') NOT NULL DEFAULT 'pending',
  attempted_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_exchange_request_notice_pending (status,created_at)
);
