-- Migration: Add primary supervisor flag
-- Description: Track a "primary" supervisor per supervisee per agency (enforced by application logic).

ALTER TABLE supervisor_assignments
  ADD COLUMN is_primary TINYINT(1) NOT NULL DEFAULT 0 AFTER agency_id;

-- Helpful index for quickly finding the primary supervisor (if present)
CREATE INDEX idx_supervisee_agency_primary
  ON supervisor_assignments (supervisee_id, agency_id, is_primary);

