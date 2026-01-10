-- Migration: Create user_info_field_definitions table
-- Description: Store field definitions at platform and agency level for user information variables

CREATE TABLE IF NOT EXISTS user_info_field_definitions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_key VARCHAR(100) NOT NULL,
    field_label VARCHAR(255) NOT NULL,
    field_type ENUM('text', 'number', 'date', 'email', 'phone', 'select', 'textarea', 'boolean') NOT NULL,
    options JSON NULL,
    is_required BOOLEAN DEFAULT FALSE,
    is_platform_template BOOLEAN DEFAULT FALSE,
    agency_id INT NULL,
    parent_field_id INT NULL,
    order_index INT DEFAULT 0,
    created_by_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_field_id) REFERENCES user_info_field_definitions(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_agency_id (agency_id),
    INDEX idx_is_platform_template (is_platform_template),
    INDEX idx_field_key (field_key),
    INDEX idx_parent_field (parent_field_id),
    UNIQUE KEY unique_agency_field_key (agency_id, field_key)
);

