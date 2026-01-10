-- Migration: Add unified task system with e-signature documents
-- Description: Create tables for tasks, document templates, signed documents, workflow, and audit logging

-- Tasks table - unified task management
CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_type ENUM('training', 'document') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('pending', 'in_progress', 'completed', 'overridden') DEFAULT 'pending',
    assigned_to_user_id INT NULL,
    assigned_to_role VARCHAR(50) NULL,
    assigned_to_agency_id INT NULL,
    assigned_by_user_id INT NOT NULL,
    due_date DATETIME NULL,
    completed_at DATETIME NULL,
    reference_id INT NULL COMMENT 'module_id for training, document_template_id for documents',
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to_agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_task_type (task_type),
    INDEX idx_status (status),
    INDEX idx_assigned_user (assigned_to_user_id),
    INDEX idx_assigned_role (assigned_to_role),
    INDEX idx_assigned_agency (assigned_to_agency_id),
    INDEX idx_due_date (due_date),
    INDEX idx_reference (reference_id)
);

-- Document templates table
CREATE TABLE IF NOT EXISTS document_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INT NOT NULL DEFAULT 1,
    template_type ENUM('pdf', 'html') NOT NULL,
    file_path VARCHAR(500) NULL COMMENT 'Path to uploaded PDF file',
    html_content LONGTEXT NULL COMMENT 'HTML template content',
    agency_id INT NULL COMMENT 'NULL for platform-wide templates',
    created_by_user_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_agency (agency_id),
    INDEX idx_active (is_active),
    INDEX idx_type (template_type),
    INDEX idx_version (version)
);

-- Signed documents table
CREATE TABLE IF NOT EXISTS signed_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_template_id INT NOT NULL,
    template_version INT NOT NULL,
    user_id INT NOT NULL,
    task_id INT NOT NULL,
    signed_pdf_path VARCHAR(500) NOT NULL,
    pdf_hash VARCHAR(64) NOT NULL COMMENT 'SHA-256 hash of final PDF',
    signed_at DATETIME NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    audit_trail JSON NULL COMMENT 'Consent, intent, identity binding records',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_template_id) REFERENCES document_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    INDEX idx_template (document_template_id),
    INDEX idx_user (user_id),
    INDEX idx_task (task_id),
    INDEX idx_signed_at (signed_at)
);

-- Document signature workflow table
CREATE TABLE IF NOT EXISTS document_signature_workflow (
    id INT AUTO_INCREMENT PRIMARY KEY,
    signed_document_id INT NOT NULL,
    consent_given_at DATETIME NULL,
    consent_ip VARCHAR(45) NULL,
    consent_user_agent TEXT NULL,
    intent_to_sign_at DATETIME NULL,
    intent_ip VARCHAR(45) NULL,
    intent_user_agent TEXT NULL,
    identity_verified_at DATETIME NULL,
    finalized_at DATETIME NULL,
    FOREIGN KEY (signed_document_id) REFERENCES signed_documents(id) ON DELETE CASCADE,
    INDEX idx_signed_doc (signed_document_id)
);

-- Task audit log table
CREATE TABLE IF NOT EXISTS task_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    action_type ENUM('assigned', 'completed', 'overridden', 'due_date_changed', 'reminder_sent') NOT NULL,
    actor_user_id INT NOT NULL,
    target_user_id INT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_task (task_id),
    INDEX idx_action_type (action_type),
    INDEX idx_actor (actor_user_id),
    INDEX idx_target (target_user_id),
    INDEX idx_created_at (created_at)
);

