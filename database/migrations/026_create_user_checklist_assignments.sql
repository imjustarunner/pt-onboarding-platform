-- Migration: Create user_custom_checklist_assignments table
-- Description: Track which custom checklist items are assigned to which users

CREATE TABLE IF NOT EXISTS user_custom_checklist_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    checklist_item_id INT NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP NULL,
    assigned_by_user_id INT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (checklist_item_id) REFERENCES custom_checklist_items(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_checklist_item (user_id, checklist_item_id),
    INDEX idx_user_id (user_id),
    INDEX idx_checklist_item_id (checklist_item_id),
    INDEX idx_is_completed (is_completed)
);

