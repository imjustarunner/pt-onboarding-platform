-- Migration 1246: Map kiosk/company event types to payroll rate-card slots.
-- Lets Outreach (and future event types) pay from the matching rate-card slot
-- instead of always using Skill Builders direct/indirect treatment.

CREATE TABLE payroll_event_type_rate_maps (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  event_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  rate_slot VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'indirect'
    COMMENT 'direct, indirect, other_1, other_2, other_3',
  use_direct_indirect_split TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = Skill Builders-style split (direct cap, remainder to rate_slot)',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_payroll_event_type_rate_maps (agency_id, event_type),
  KEY idx_payroll_event_type_rate_maps_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
