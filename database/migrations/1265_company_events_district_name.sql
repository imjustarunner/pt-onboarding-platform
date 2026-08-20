-- Migration 1265: district-level Outreach events (not tied to a school)
-- One company_events row with organization_id NULL and district_name set.
-- event_type school_outreach is application-level (no ENUM change).

ALTER TABLE company_events
  ADD COLUMN district_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'District affiliation when organization_id is NULL (district outreach events)';

ALTER TABLE company_events
  ADD INDEX idx_company_events_district_name (district_name(64));
