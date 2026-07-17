-- Migration 960: district-wide school event broadcast id + school portal calendar icon

ALTER TABLE company_events
  ADD COLUMN district_broadcast_id CHAR(36) NULL DEFAULT NULL
    COMMENT 'Shared UUID when one district holiday/day-off is fan-out to many schools';

ALTER TABLE company_events
  ADD INDEX idx_company_events_district_broadcast (district_broadcast_id);

ALTER TABLE platform_branding
  ADD COLUMN school_portal_calendar_icon_id INT NULL;

ALTER TABLE agencies
  ADD COLUMN school_portal_calendar_icon_id INT NULL;
