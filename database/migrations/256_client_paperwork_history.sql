-- Track dated paperwork/document status updates per client.
-- Each row represents a status change with an effective date and (optional) delivery method.

CREATE TABLE IF NOT EXISTS client_paperwork_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  paperwork_status_id INT NULL,
  paperwork_delivery_method_id INT NULL,
  effective_date DATE NOT NULL,
  note TEXT NULL,
  changed_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_client_paperwork_client_date (client_id, effective_date),
  INDEX idx_client_paperwork_client_created (client_id, created_at),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (paperwork_status_id) REFERENCES paperwork_statuses(id) ON DELETE SET NULL,
  FOREIGN KEY (paperwork_delivery_method_id) REFERENCES paperwork_delivery_methods(id) ON DELETE SET NULL,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

