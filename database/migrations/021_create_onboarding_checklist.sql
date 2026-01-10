-- Migration: Create onboarding_checklist_items table
-- Description: Track onboarding progress per user

CREATE TABLE IF NOT EXISTS onboarding_checklist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_type ENUM('profile', 'training', 'document', 'account_setup', 'custom') NOT NULL,
    item_id INT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP NULL,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_item_type (item_type),
    INDEX idx_completed (is_completed)
);

