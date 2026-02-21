-- Migration: Create agency_contacts and segmentation tables
-- Description: Agency-level contacts with share_with_all, client-linked visibility,
-- and links to schools/providers for mass communications targeting.

CREATE TABLE IF NOT EXISTS agency_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  created_by_user_id INT NULL,
  share_with_all BOOLEAN NOT NULL DEFAULT FALSE,
  client_id INT NULL,
  full_name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(32) NULL,
  source ENUM('manual', 'auto_guardian', 'auto_school', 'auto_client') NOT NULL DEFAULT 'manual',
  source_ref_id INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agency_contacts_agency (agency_id),
  INDEX idx_agency_contacts_client (client_id),
  INDEX idx_agency_contacts_created_by (created_by_user_id),
  INDEX idx_agency_contacts_agency_active (agency_id, is_active),
  INDEX idx_agency_contacts_email (agency_id, email),
  INDEX idx_agency_contacts_phone (phone),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_school_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_contact_school (contact_id, school_organization_id),
  INDEX idx_contact_school_contact (contact_id),
  INDEX idx_contact_school_school (school_organization_id),
  FOREIGN KEY (contact_id) REFERENCES agency_contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_provider_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_contact_provider (contact_id, provider_user_id),
  INDEX idx_contact_provider_contact (contact_id),
  INDEX idx_contact_provider_provider (provider_user_id),
  FOREIGN KEY (contact_id) REFERENCES agency_contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
