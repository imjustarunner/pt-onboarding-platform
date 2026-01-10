-- Migration: Create user_communications table
-- Description: Store generated email communications sent to users for reference

CREATE TABLE IF NOT EXISTS user_communications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'User who received the communication',
    agency_id INT NOT NULL COMMENT 'Agency context for this communication',
    template_type VARCHAR(100) NOT NULL COMMENT 'Type of template used (e.g., "user_welcome")',
    template_id INT NULL COMMENT 'Reference to email_templates table (may be NULL if template was deleted)',
    subject VARCHAR(500) NOT NULL COMMENT 'Rendered email subject',
    body TEXT NOT NULL COMMENT 'Rendered email body (all variables replaced)',
    generated_by_user_id INT NOT NULL COMMENT 'Admin/support user who generated this communication',
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL,
    FOREIGN KEY (generated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_user_id (user_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_template_type (template_type),
    INDEX idx_generated_at (generated_at),
    INDEX idx_user_agency (user_id, agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
