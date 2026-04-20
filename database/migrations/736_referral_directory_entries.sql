-- 736_referral_directory_entries.sql
-- Phase 2 of the Referral Directory feature: the catalog rows.
--
-- Each row is an external referral SOURCE / resource (e.g. "Dr. Smith,
-- pediatric psychiatry, 555-0100, accepts Medicaid") that a provider can
-- hand to a family. Entries are agency-scoped and belong to one category
-- (migration 735). approval_status handles admin-created rows directly
-- ('approved') while non-admin creates go through
-- referral_directory_change_requests (migration 737) -- the row is only
-- inserted here after an admin approves the request, so pending rows are
-- NOT surfaced in this table's normal list queries.
--
-- The approval_status column is kept anyway so we can optionally allow
-- "soft pending" rows in a future iteration (e.g. show greyed-out rows
-- with a 'pending' badge) without a second migration.

CREATE TABLE IF NOT EXISTS referral_directory_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  category_id INT NULL,
  name VARCHAR(200) NOT NULL,
  organization_name VARCHAR(200) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(200) NULL,
  website VARCHAR(300) NULL,
  address VARCHAR(400) NULL,
  specialties TEXT NULL,
  insurances_accepted TEXT NULL,
  notes TEXT NULL,
  created_by_user_id INT NULL,
  approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  approved_by_user_id INT NULL,
  approved_at DATETIME NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES referral_directory_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_agency (agency_id),
  INDEX idx_agency_category (agency_id, category_id),
  INDEX idx_agency_active (agency_id, is_active),
  INDEX idx_approval_status (approval_status),
  FULLTEXT INDEX ft_search (name, organization_name, specialties, notes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
