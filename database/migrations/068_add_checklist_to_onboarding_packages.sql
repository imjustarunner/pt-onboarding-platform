-- Migration: Add checklist items to onboarding packages
-- Description: Create junction table to link checklist items directly to onboarding packages

CREATE TABLE IF NOT EXISTS onboarding_package_checklist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    package_id INT NOT NULL,
    checklist_item_id INT NOT NULL,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES onboarding_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (checklist_item_id) REFERENCES custom_checklist_items(id) ON DELETE CASCADE,
    UNIQUE KEY unique_package_checklist_item (package_id, checklist_item_id),
    INDEX idx_package (package_id),
    INDEX idx_checklist_item (checklist_item_id)
);
