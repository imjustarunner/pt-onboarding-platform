-- Migration: Create account_types table
-- Description: Platform-level account type templates that can be pushed to agencies

CREATE TABLE IF NOT EXISTS account_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    is_platform_template BOOLEAN DEFAULT FALSE,
    agency_id INT NULL,
    created_by_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_platform_template (is_platform_template),
    INDEX idx_agency_id (agency_id)
);

