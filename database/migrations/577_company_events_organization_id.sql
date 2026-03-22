-- Optional affiliated organization (program, etc.) for agency-scoped company events.
ALTER TABLE company_events
  ADD COLUMN organization_id INT NULL DEFAULT NULL
    COMMENT 'Affiliated child org (non-agency). NULL = agency-wide event.'
    AFTER agency_id,
  ADD INDEX idx_company_events_agency_org_starts (agency_id, organization_id, starts_at),
  ADD CONSTRAINT fk_company_events_organization
    FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE SET NULL;
