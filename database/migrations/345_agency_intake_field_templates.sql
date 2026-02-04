-- Per-agency intake field templates
CREATE TABLE IF NOT EXISTS agency_intake_field_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  fields_json JSON NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_intake_field_templates_agency (agency_id),
  INDEX idx_intake_field_templates_active (agency_id, is_active)
);
