-- Migration: Create user activity log table
-- Description: Track user activities including login, logout, timeout, and other actions

CREATE TABLE IF NOT EXISTS user_activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action_type ENUM('login', 'logout', 'timeout', 'page_view', 'api_call') NOT NULL,
    user_id INT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    session_id VARCHAR(255) NULL,
    agency_id INT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_action_type (action_type),
    INDEX idx_session_id (session_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_created_at (created_at),
    INDEX idx_user_action (user_id, action_type)
);

