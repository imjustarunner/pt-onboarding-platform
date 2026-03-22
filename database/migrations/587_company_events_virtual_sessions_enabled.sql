-- Skill Builders event portal: show/hide Virtual sessions (join links) card from one toggle.

ALTER TABLE company_events
  ADD COLUMN virtual_sessions_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'When 0, event portal hides Virtual sessions card (join links) for this program event'
    AFTER employee_departure_time;
