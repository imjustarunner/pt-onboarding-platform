-- Migration: Create client_notes table
-- Description: Messaging/comment system for clients with internal vs shared note support

CREATE TABLE IF NOT EXISTS client_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    author_id INT NOT NULL,
    message TEXT NOT NULL,
    is_internal_only BOOLEAN DEFAULT FALSE COMMENT 'true = agency-only, false = shared with school',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign keys
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Indexes for efficient queries
    INDEX idx_client_id (client_id),
    INDEX idx_created_at (created_at),
    INDEX idx_author (author_id),
    INDEX idx_internal_only (is_internal_only)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
