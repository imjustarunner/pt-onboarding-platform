-- Migration: Create supervisor assignments table
-- Description: Create table for assigning users to supervisors within agencies

CREATE TABLE IF NOT EXISTS supervisor_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supervisor_id INT NOT NULL COMMENT 'User ID of the supervisor',
    supervisee_id INT NOT NULL COMMENT 'User ID of the supervisee',
    agency_id INT NOT NULL COMMENT 'Agency where this assignment applies',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INT NULL COMMENT 'User who created this assignment',
    FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (supervisee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_assignment (supervisor_id, supervisee_id, agency_id),
    INDEX idx_supervisor_id (supervisor_id),
    INDEX idx_supervisee_id (supervisee_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_supervisor_agency (supervisor_id, agency_id),
    INDEX idx_supervisee_agency (supervisee_id, agency_id)
);
