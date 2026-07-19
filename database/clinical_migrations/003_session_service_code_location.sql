-- Migration 003: Link encounters to service code, units, and service location (POS)
ALTER TABLE clinical_sessions
  ADD COLUMN service_code VARCHAR(32) NULL,
  ADD COLUMN effective_service_code VARCHAR(32) NULL
    COMMENT 'After overflow auto-switch',
  ADD COLUMN service_location_id INT NULL
    COMMENT 'agency_service_locations.id in main DB',
  ADD COLUMN billing_office_location_id INT NULL
    COMMENT 'office_locations.id used for billing address',
  ADD COLUMN billed_units DECIMAL(8,2) NULL,
  ADD COLUMN claim_blocked_reason VARCHAR(255) NULL
    COMMENT 'Set when duration below min or otherwise not claimable';
