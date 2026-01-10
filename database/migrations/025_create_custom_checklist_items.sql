-- Migration: Create custom_checklist_items table
-- Description: Store custom checklist item definitions (similar to user info fields)

CREATE TABLE IF NOT EXISTS custom_checklist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_key VARCHAR(100) NOT NULL,
    item_label VARCHAR(255) NOT NULL,
    description TEXT NULL,
    is_platform_template BOOLEAN DEFAULT FALSE,
    agency_id INT NULL,
    parent_item_id INT NULL,
    order_index INT DEFAULT 0,
    auto_assign BOOLEAN DEFAULT FALSE,
    created_by_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_item_id) REFERENCES custom_checklist_items(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_agency_id (agency_id),
    INDEX idx_is_platform_template (is_platform_template),
    INDEX idx_item_key (item_key),
    INDEX idx_parent_item (parent_item_id),
    UNIQUE KEY unique_agency_item_key (agency_id, item_key)
);

