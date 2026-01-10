-- Migration: Add Agency Public Training Assignments
-- Description: Allow agencies to have specific training focuses and modules assigned as public

-- Agency Public Training Focuses
CREATE TABLE IF NOT EXISTS agency_public_training_focuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    training_focus_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (training_focus_id) REFERENCES training_tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_agency_training_focus (agency_id, training_focus_id),
    INDEX idx_agency (agency_id),
    INDEX idx_training_focus (training_focus_id)
);

-- Agency Public Modules
CREATE TABLE IF NOT EXISTS agency_public_modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    module_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_agency_module (agency_id, module_id),
    INDEX idx_agency (agency_id),
    INDEX idx_module (module_id)
);

