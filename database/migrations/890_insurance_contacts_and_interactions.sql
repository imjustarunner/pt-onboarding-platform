-- Migration 890: insurance logos, multiple contacts, and call/interaction tracking

ALTER TABLE insurance_credentialing_definitions
  ADD COLUMN logo_path VARCHAR(512) NULL
  COMMENT 'Uploaded logo image path (uploads/...)';

CREATE TABLE insurance_credentialing_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  insurance_credentialing_definition_id INT NOT NULL,
  agency_id INT NOT NULL,
  label VARCHAR(128) NULL COMMENT 'Department or role, e.g. Credentialing dept',
  contact_name VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  email VARCHAR(255) NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (insurance_credentialing_definition_id) REFERENCES insurance_credentialing_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_icc_insurance (insurance_credentialing_definition_id),
  INDEX idx_icc_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE insurance_credentialing_interactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  insurance_credentialing_definition_id INT NOT NULL,
  user_id INT NULL COMMENT 'Provider when the call is about a specific employee; NULL for agency-wide',
  contact_id INT NULL COMMENT 'Optional link to insurance_credentialing_contacts row used',
  interaction_at DATETIME NOT NULL,
  caller_user_id INT NOT NULL COMMENT 'Staff member who placed the call',
  phone_number_called VARCHAR(64) NULL,
  contact_person_name VARCHAR(255) NULL COMMENT 'Person spoken to at the payer',
  outcome VARCHAR(128) NULL,
  reference_id VARCHAR(128) NULL COMMENT 'Job ID, call ID, ticket number, etc.',
  notes TEXT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (insurance_credentialing_definition_id) REFERENCES insurance_credentialing_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES insurance_credentialing_contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (caller_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ici_agency_insurance (agency_id, insurance_credentialing_definition_id),
  INDEX idx_ici_user (user_id),
  INDEX idx_ici_interaction_at (interaction_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
