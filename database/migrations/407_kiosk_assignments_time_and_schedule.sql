-- Migration: Extend kiosk_agency_assignments for event and program_staff types
-- valid_from/valid_until: event kiosks (e.g. 8 weeks)
-- allowed_days_json: program staff kiosks (e.g. ["saturday"])

ALTER TABLE kiosk_agency_assignments
  ADD COLUMN valid_from DATE NULL COMMENT 'Event kiosks: start date' AFTER settings_json,
  ADD COLUMN valid_until DATE NULL COMMENT 'Event kiosks: end date (e.g. 8 weeks)' AFTER valid_from,
  ADD COLUMN allowed_days_json JSON NULL COMMENT 'e.g. ["saturday"] for program staff kiosk' AFTER valid_until;
