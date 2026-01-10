-- Migration: Add training tracks table
-- Description: Organize modules into tracks (Pre-Hire, Core Onboarding, etc.)

CREATE TABLE IF NOT EXISTS training_tracks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INT DEFAULT 0,
    assignment_level ENUM('platform', 'agency', 'role') DEFAULT 'platform',
    agency_id INT NULL,
    role VARCHAR(50) NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    INDEX idx_order (order_index),
    INDEX idx_assignment_level (assignment_level),
    INDEX idx_agency (agency_id),
    INDEX idx_active (is_active)
);

-- Junction table for tracks and modules
CREATE TABLE IF NOT EXISTS track_modules (
    track_id INT NOT NULL,
    module_id INT NOT NULL,
    order_index INT DEFAULT 0,
    PRIMARY KEY (track_id, module_id),
    FOREIGN KEY (track_id) REFERENCES training_tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    INDEX idx_track (track_id),
    INDEX idx_module (module_id),
    INDEX idx_order (order_index)
);

