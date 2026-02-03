-- Migration: Create clinical_note_drafts table
-- Description: Temporary drafts for Clinical Note Generator with strict TTL cleanup.

CREATE TABLE IF NOT EXISTS clinical_note_drafts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    agency_id INT NULL,

    service_code VARCHAR(32) NULL,
    program_id INT NULL,
    date_of_service DATE NULL,
    initials VARCHAR(16) NULL,

    input_text TEXT NULL,
    -- Store agent output as JSON text (LONGTEXT for compatibility and size).
    output_json LONGTEXT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,

    -- Indexes
    INDEX idx_cnd_user_created_at (user_id, created_at),
    INDEX idx_cnd_created_at (created_at),
    INDEX idx_cnd_agency_id (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

