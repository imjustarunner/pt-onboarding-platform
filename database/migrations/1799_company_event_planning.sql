-- Company gatherings may be planned, discussed and polled before their date is decided.
-- Existing event times and all clinical session-date constraints are preserved.
ALTER TABLE company_events MODIFY COLUMN starts_at DATETIME NULL, MODIFY COLUMN ends_at DATETIME NULL;

-- Retain historical groups and their memberships while removing them from new invitations.
ALTER TABLE skills_groups ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX idx_skills_group_active_audience ON skills_groups (agency_id, is_active, end_date);
