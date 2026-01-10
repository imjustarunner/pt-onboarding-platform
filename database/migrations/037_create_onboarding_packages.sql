-- Migration: Create onboarding packages system
-- Description: Allow admins to create reusable onboarding packages that group training focuses, modules, and documents

-- Onboarding packages table
CREATE TABLE IF NOT EXISTS onboarding_packages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    agency_id INT NULL COMMENT 'NULL for platform-wide packages, otherwise agency-specific',
    is_active BOOLEAN DEFAULT TRUE,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_agency (agency_id),
    INDEX idx_active (is_active),
    INDEX idx_name (name)
);

-- Junction table for training focuses in packages
CREATE TABLE IF NOT EXISTS onboarding_package_training_focuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    package_id INT NOT NULL,
    track_id INT NOT NULL,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES onboarding_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES training_tracks(id) ON DELETE CASCADE,
    UNIQUE KEY unique_package_track (package_id, track_id),
    INDEX idx_package (package_id),
    INDEX idx_track (track_id)
);

-- Junction table for modules in packages
CREATE TABLE IF NOT EXISTS onboarding_package_modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    package_id INT NOT NULL,
    module_id INT NOT NULL,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES onboarding_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE KEY unique_package_module (package_id, module_id),
    INDEX idx_package (package_id),
    INDEX idx_module (module_id)
);

-- Junction table for documents in packages
CREATE TABLE IF NOT EXISTS onboarding_package_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    package_id INT NOT NULL,
    document_template_id INT NOT NULL,
    order_index INT DEFAULT 0,
    action_type ENUM('signature', 'review') DEFAULT 'signature',
    due_date_days INT NULL COMMENT 'Number of days from assignment to set as due date',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES onboarding_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (document_template_id) REFERENCES document_templates(id) ON DELETE CASCADE,
    UNIQUE KEY unique_package_document (package_id, document_template_id),
    INDEX idx_package (package_id),
    INDEX idx_document (document_template_id)
);

