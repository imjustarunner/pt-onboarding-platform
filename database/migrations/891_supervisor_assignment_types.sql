-- Migration 891: supervisor assignment types (clinical, manager, billing)

ALTER TABLE supervisor_assignments
  ADD COLUMN supervisor_type VARCHAR(32) NOT NULL DEFAULT 'clinical'
  COMMENT 'clinical, manager, or billing'
  AFTER agency_id;

ALTER TABLE supervisor_assignments
  DROP INDEX unique_assignment;

ALTER TABLE supervisor_assignments
  ADD UNIQUE KEY uniq_supervisee_agency_type (supervisee_id, agency_id, supervisor_type);

CREATE INDEX idx_supervisor_assignments_type
  ON supervisor_assignments (supervisor_type, agency_id, supervisee_id);
