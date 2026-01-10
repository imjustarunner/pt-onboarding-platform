-- Migration: Add programs table
-- Description: Programs belong to agencies

CREATE TABLE IF NOT EXISTS programs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    INDEX idx_agency (agency_id),
    INDEX idx_active (is_active)
);

-- Create default ITSCO program (assuming PlotTwistCo agency has id=1)
INSERT INTO programs (agency_id, name, description, is_active)
SELECT id, 'ITSCO', 'ITSCO Program', TRUE
FROM agencies WHERE slug = 'plottwistco' LIMIT 1
ON DUPLICATE KEY UPDATE programs.name=programs.name;

