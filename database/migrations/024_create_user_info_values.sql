-- Migration: Create user_info_values table
-- Description: Store actual user values for information fields

CREATE TABLE IF NOT EXISTS user_info_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    field_definition_id INT NOT NULL,
    value TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (field_definition_id) REFERENCES user_info_field_definitions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_field (user_id, field_definition_id),
    INDEX idx_user_id (user_id),
    INDEX idx_field_definition_id (field_definition_id)
);

