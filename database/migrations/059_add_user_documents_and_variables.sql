-- Migration: Add user documents and template variables system
-- Description: Create tables for personalized user document copies and user-specific documents, update signed_documents
-- Rewritten to use plain SQL compatible with mysql2 prepared statements (no DELIMITER or stored procedures)

-- Create user_documents table for personalized template copies
CREATE TABLE IF NOT EXISTS user_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_template_id INT NOT NULL,
  user_id INT NOT NULL,
  task_id INT NOT NULL,
  personalized_content LONGTEXT NULL COMMENT 'HTML with variables replaced',
  personalized_file_path VARCHAR(500) NULL COMMENT 'PDF with variables replaced',
  generated_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_template_id) REFERENCES document_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_template_task (user_id, document_template_id, task_id),
  INDEX idx_user (user_id),
  INDEX idx_template (document_template_id),
  INDEX idx_task (task_id)
);

-- Create user_specific_documents table for non-template documents
CREATE TABLE IF NOT EXISTS user_specific_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  task_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_type ENUM('pdf', 'html') NOT NULL,
  file_path VARCHAR(500) NULL,
  html_content LONGTEXT NULL,
  document_action_type ENUM('signature', 'review') DEFAULT 'signature',
  icon_id INT NULL,
  signature_x DECIMAL(10, 2) NULL,
  signature_y DECIMAL(10, 2) NULL,
  signature_width DECIMAL(10, 2) NULL,
  signature_height DECIMAL(10, 2) NULL,
  signature_page INT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_task (task_id)
);

-- Update signed_documents to link to user_documents
-- Note: If column already exists, the migration runner will catch "Duplicate column" error and skip
ALTER TABLE signed_documents 
ADD COLUMN user_document_id INT NULL AFTER document_template_id;

-- Add foreign key constraint for user_document_id
ALTER TABLE signed_documents 
ADD CONSTRAINT fk_signed_documents_user_document_id
FOREIGN KEY (user_document_id) REFERENCES user_documents(id) ON DELETE CASCADE;

-- Add index for user_document_id
CREATE INDEX idx_signed_documents_user_document ON signed_documents(user_document_id);

-- Migrate existing user-specific documents from document_templates to user_specific_documents
-- Note: This will only work if there are existing tasks linked to these documents
INSERT INTO user_specific_documents (
  user_id,
  task_id,
  name,
  description,
  template_type,
  file_path,
  html_content,
  document_action_type,
  icon_id,
  signature_x,
  signature_y,
  signature_width,
  signature_height,
  signature_page,
  created_by_user_id,
  created_at
)
SELECT 
  dt.user_id,
  t.id as task_id,
  dt.name,
  dt.description,
  dt.template_type,
  dt.file_path,
  dt.html_content,
  dt.document_action_type,
  dt.icon_id,
  dt.signature_x,
  dt.signature_y,
  dt.signature_width,
  dt.signature_height,
  dt.signature_page,
  dt.created_by_user_id,
  dt.created_at
FROM document_templates dt
LEFT JOIN tasks t ON t.reference_id = dt.id AND t.task_type = 'document'
WHERE dt.is_user_specific = TRUE
AND dt.user_id IS NOT NULL
AND t.id IS NOT NULL
ON DUPLICATE KEY UPDATE user_specific_documents.name = dt.name;
