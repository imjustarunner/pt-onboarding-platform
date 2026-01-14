-- Migration: Create clients table
-- Description: Primary table for client records, supporting agency-side full visibility and school-side restricted views

CREATE TABLE IF NOT EXISTS clients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL COMMENT 'School organization (references agencies.id where organization_type = school)',
    agency_id INT NOT NULL COMMENT 'Agency organization that owns/manages this client',
    provider_id INT NULL COMMENT 'Assigned provider/user (nullable while pending)',
    initials VARCHAR(10) NOT NULL COMMENT 'Client initials for school view (may be derived from full name)',
    status ENUM('PENDING_REVIEW', 'ACTIVE', 'ON_HOLD', 'DECLINED', 'ARCHIVED') DEFAULT 'PENDING_REVIEW' NOT NULL,
    submission_date DATE NOT NULL COMMENT 'When referral/import was submitted',
    document_status ENUM('NONE', 'UPLOADED', 'APPROVED', 'REJECTED') DEFAULT 'NONE' NOT NULL,
    source ENUM('BULK_IMPORT', 'SCHOOL_UPLOAD', 'DIGITAL_FORM', 'ADMIN_CREATED') NOT NULL,
    created_by_user_id INT NULL COMMENT 'User who created this client record',
    updated_by_user_id INT NULL COMMENT 'User who last updated this client record',
    last_activity_at TIMESTAMP NULL COMMENT 'Last activity timestamp for this client',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign keys
    FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE RESTRICT,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Indexes for efficient queries
    INDEX idx_organization_id (organization_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_provider_id (provider_id),
    INDEX idx_status (status),
    INDEX idx_submission_date (submission_date),
    INDEX idx_document_status (document_status),
    INDEX idx_source (source),
    INDEX idx_last_activity (last_activity_at),
    
    -- Composite index for smart matching (agency_id + organization_id + initials)
    INDEX idx_match_key (agency_id, organization_id, initials)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
