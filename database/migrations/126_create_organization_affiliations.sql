-- Migration: Create organization_affiliations linkage table
-- Purpose: Link an Agency organization to child organizations (School, Program, Learning) for billing/scoping/branding.
--
-- Notes:
-- - This generalizes the existing agency_schools table.
-- - We backfill existing school links from agency_schools for compatibility.

CREATE TABLE IF NOT EXISTS organization_affiliations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  organization_id INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_agency_org (agency_id, organization_id),
  INDEX idx_affiliation_agency (agency_id),
  INDEX idx_affiliation_org (organization_id),
  INDEX idx_affiliation_active (agency_id, is_active)
);

-- Backfill existing school affiliations.
INSERT INTO organization_affiliations (agency_id, organization_id, is_active, created_at, updated_at)
SELECT agency_id, school_organization_id, is_active, created_at, updated_at
FROM agency_schools
ON DUPLICATE KEY UPDATE
  is_active = VALUES(is_active),
  updated_at = VALUES(updated_at);

