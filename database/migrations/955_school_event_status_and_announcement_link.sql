-- Migration 955: school event lifecycle status + link announcements to events
ALTER TABLE company_events
  ADD COLUMN school_event_status VARCHAR(32) NULL DEFAULT NULL
  COMMENT 'scheduled|rescheduled|canceled for school portal events';

ALTER TABLE school_portal_announcements
  ADD COLUMN company_event_id INT NULL
  COMMENT 'Optional link to company_events for auto school-event banners';

CREATE INDEX idx_spa_company_event_id
  ON school_portal_announcements (company_event_id);