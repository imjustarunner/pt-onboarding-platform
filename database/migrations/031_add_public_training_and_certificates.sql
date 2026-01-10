-- Migration: Add public training access and certificate system
-- Description: Add approved employee emails, public access toggles, certificates, and standalone modules

-- Approved Employee Email List
CREATE TABLE IF NOT EXISTS approved_employee_emails (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    agency_id INT NOT NULL,
    requires_verification BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP NULL,
    verification_token VARCHAR(255) NULL,
    verification_token_expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_email_agency (email, agency_id),
    INDEX idx_email (email),
    INDEX idx_agency (agency_id),
    INDEX idx_active (is_active),
    INDEX idx_verification_token (verification_token)
);

-- Add public access toggles to modules
ALTER TABLE modules
ADD COLUMN is_always_accessible BOOLEAN DEFAULT FALSE AFTER assignment_level,
ADD COLUMN is_public BOOLEAN DEFAULT FALSE AFTER is_always_accessible,
ADD COLUMN is_standalone BOOLEAN DEFAULT FALSE AFTER is_public,
ADD COLUMN standalone_category VARCHAR(100) NULL AFTER is_standalone,
ADD INDEX idx_always_accessible (is_always_accessible),
ADD INDEX idx_public (is_public),
ADD INDEX idx_standalone (is_standalone);

-- Certificates table
CREATE TABLE IF NOT EXISTS certificates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL, -- NULL for public training (no user account)
    email VARCHAR(255) NULL, -- For approved employees without user account
    certificate_type ENUM('training_focus', 'module') NOT NULL,
    reference_id INT NOT NULL, -- training_focus_id or module_id
    certificate_data JSON, -- Stores certificate details (name, completion date, etc.)
    pdf_path VARCHAR(500) NULL, -- Path to generated PDF
    certificate_number VARCHAR(100) NULL, -- Unique certificate number
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_email (email),
    INDEX idx_type_reference (certificate_type, reference_id),
    INDEX idx_issued_at (issued_at)
);

-- Agency setting for email verification requirement
ALTER TABLE agencies
ADD COLUMN requires_email_verification BOOLEAN DEFAULT FALSE AFTER contact_info;

