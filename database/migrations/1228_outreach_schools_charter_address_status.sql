-- Migration 1228: Charter flag, search aliases, and address status for outreach directory

ALTER TABLE outreach_schools
  ADD COLUMN is_charter TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 when the campus is a charter (district-authorized or CSI)',
  ADD COLUMN search_aliases VARCHAR(512) NULL
  COMMENT 'Pipe-separated alternate names used in Outreach Hub search',
  ADD COLUMN address_status VARCHAR(32) NOT NULL DEFAULT 'unknown'
  COMMENT 'verified | missing | lookup_failed | unknown';

CREATE INDEX idx_outreach_address_status ON outreach_schools (agency_id, address_status);
CREATE INDEX idx_outreach_is_charter ON outreach_schools (agency_id, is_charter);
