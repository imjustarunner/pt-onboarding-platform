-- Migration: Letterhead templates + letter layout support
-- Description: Add reusable letterhead templates and enable HTML templates to render as print-safe letters (no stored PDFs).

CREATE TABLE IF NOT EXISTS letterhead_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,

  -- Scope: platform (agency_id NULL), agency (agency_id set), optional affiliated organization (organization_id)
  agency_id INT NULL,
  organization_id INT NULL,

  -- Type: uploaded asset (svg/png) OR pure html/css header/footer
  template_type ENUM('svg', 'png', 'html') NOT NULL DEFAULT 'html',
  file_path VARCHAR(500) NULL,
  header_html LONGTEXT NULL,
  footer_html LONGTEXT NULL,
  css_content LONGTEXT NULL,

  -- Print settings
  page_size ENUM('letter', 'a4') NOT NULL DEFAULT 'letter',
  orientation ENUM('portrait', 'landscape') NOT NULL DEFAULT 'portrait',
  margin_top DECIMAL(10,2) NOT NULL DEFAULT 72.00,
  margin_right DECIMAL(10,2) NOT NULL DEFAULT 72.00,
  margin_bottom DECIMAL(10,2) NOT NULL DEFAULT 72.00,
  margin_left DECIMAL(10,2) NOT NULL DEFAULT 72.00,
  header_height DECIMAL(10,2) NOT NULL DEFAULT 96.00,
  footer_height DECIMAL(10,2) NOT NULL DEFAULT 72.00,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_letterhead_templates_agency (agency_id),
  INDEX idx_letterhead_templates_org (organization_id),
  INDEX idx_letterhead_templates_active (is_active),

  CONSTRAINT fk_letterhead_templates_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_letterhead_templates_organization_id FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_letterhead_templates_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Document templates: enable letter layout (HTML only)
ALTER TABLE document_templates
ADD COLUMN layout_type ENUM('standard', 'letter') NOT NULL DEFAULT 'standard' AFTER template_type;

ALTER TABLE document_templates
ADD COLUMN letterhead_template_id INT NULL AFTER organization_id;

ALTER TABLE document_templates
ADD COLUMN letter_header_html LONGTEXT NULL AFTER html_content;

ALTER TABLE document_templates
ADD COLUMN letter_footer_html LONGTEXT NULL AFTER letter_header_html;

ALTER TABLE document_templates
ADD INDEX idx_document_templates_letterhead (letterhead_template_id);

ALTER TABLE document_templates
ADD CONSTRAINT fk_document_templates_letterhead_template_id
FOREIGN KEY (letterhead_template_id) REFERENCES letterhead_templates(id) ON DELETE SET NULL;

