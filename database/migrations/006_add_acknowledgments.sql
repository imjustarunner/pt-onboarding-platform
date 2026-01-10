-- Migration: Add acknowledgments table
-- Description: Track user acknowledgments (checkbox + timestamp)

CREATE TABLE IF NOT EXISTS acknowledgments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    module_id INT NOT NULL,
    acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_module (user_id, module_id),
    INDEX idx_user (user_id),
    INDEX idx_module (module_id),
    INDEX idx_acknowledged_at (acknowledged_at)
);

