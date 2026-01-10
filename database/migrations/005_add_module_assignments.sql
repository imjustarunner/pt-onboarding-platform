-- Migration: Add module assignments table
-- Description: Track module assignments at platform/agency/program/role levels

CREATE TABLE IF NOT EXISTS module_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    module_id INT NOT NULL,
    assignment_type ENUM('platform', 'agency', 'program', 'role') NOT NULL,
    assignment_id INT NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    is_optional BOOLEAN DEFAULT FALSE,
    is_assigned BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    INDEX idx_module (module_id),
    INDEX idx_assignment_type (assignment_type, assignment_id),
    UNIQUE KEY unique_assignment (module_id, assignment_type, assignment_id)
);

