-- Migration: Per-client document status checklist (Needed/Received)
-- Description: Track which paperwork statuses are still needed per client and when they were received.

CREATE TABLE IF NOT EXISTS client_paperwork_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  paperwork_status_id INT NOT NULL,
  is_needed TINYINT(1) NOT NULL DEFAULT 1,
  received_at DATETIME NULL,
  received_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_client_paperwork_item (client_id, paperwork_status_id),
  INDEX idx_client_paperwork_needed (client_id, is_needed),
  INDEX idx_client_paperwork_status_needed (paperwork_status_id, is_needed),

  CONSTRAINT fk_client_paperwork_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_paperwork_status
    FOREIGN KEY (paperwork_status_id) REFERENCES paperwork_statuses(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_paperwork_received_by
    FOREIGN KEY (received_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

