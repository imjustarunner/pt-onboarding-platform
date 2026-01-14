-- Migration: Create client_status_history table
-- Description: Audit trail for client changes (status, provider assignment, etc.)

CREATE TABLE IF NOT EXISTS client_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    changed_by_user_id INT NOT NULL,
    field_changed VARCHAR(100) NOT NULL COMMENT 'Field that was changed (e.g., status, provider_id)',
    from_value TEXT NULL COMMENT 'Previous value',
    to_value TEXT NOT NULL COMMENT 'New value',
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    note TEXT NULL COMMENT 'Optional note explaining why change was made',
    
    -- Foreign keys
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Indexes for efficient queries
    INDEX idx_client_id (client_id),
    INDEX idx_changed_at (changed_at),
    INDEX idx_changed_by (changed_by_user_id),
    INDEX idx_field_changed (field_changed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
