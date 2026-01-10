-- Migration: Create email_templates table
-- Description: Store email templates for user communications (platform defaults and agency overrides)

CREATE TABLE IF NOT EXISTS email_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL COMMENT 'Template name (e.g., "Welcome Email", "Password Reset")',
    type VARCHAR(100) NOT NULL COMMENT 'Template type (e.g., "user_welcome", "password_reset")',
    subject VARCHAR(500) NOT NULL COMMENT 'Email subject line (supports template variables)',
    body TEXT NOT NULL COMMENT 'Email body in plain text (supports template variables)',
    agency_id INT NULL COMMENT 'NULL for platform defaults, agency_id for agency-specific overrides',
    platform_branding_id INT NULL COMMENT 'Reference to platform_branding for platform templates',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by_user_id INT NULL COMMENT 'User who created this template',
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (platform_branding_id) REFERENCES platform_branding(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_type (type),
    INDEX idx_agency_id (agency_id),
    INDEX idx_platform_branding_id (platform_branding_id),
    UNIQUE KEY unique_agency_template (agency_id, type),
    UNIQUE KEY unique_platform_template (platform_branding_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
