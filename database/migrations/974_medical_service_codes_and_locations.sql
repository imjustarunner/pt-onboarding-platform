-- Migration 974: Agency medical service codes (units/ladders/overflow) + service locations (POS)
-- Billing address stays on office_locations / agency; service location is where care happened.

ALTER TABLE office_locations
  ADD COLUMN default_place_of_service CHAR(2) NULL
    COMMENT 'CMS POS default when this office is the service site (e.g. 11)',
  ADD COLUMN use_as_billing_address TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'When 1, claims can bill under this office street address';

CREATE TABLE IF NOT EXISTS agency_medical_service_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  description VARCHAR(500) NULL,
  unit_calc_mode ENUM('NONE','SINGLE','MEDICAID_8_MINUTE_LADDER','FIXED_BLOCK','CUSTOM_BANDS')
    NOT NULL DEFAULT 'SINGLE'
    COMMENT 'NONE/SINGLE=1 unit per encounter; ladder/block/bands for multi-unit',
  unit_minutes INT NULL COMMENT 'Nominal minutes per unit (e.g. 15)',
  min_minutes INT NULL COMMENT 'Below this → not claimable',
  max_minutes INT NULL COMMENT 'At/above overflow threshold may switch code',
  max_units_per_session INT NULL,
  max_units_per_day INT NULL,
  ladder_bands_json JSON NULL
    COMMENT '[{units,minMinutes,maxMinutes},...] explicit bands; null = derive from 8-min ladder',
  overflow_service_code VARCHAR(32) NULL
    COMMENT 'Auto-switch to this code when duration exceeds overflow_at_minutes',
  overflow_at_minutes INT NULL
    COMMENT 'Minutes at which overflow_service_code applies; default max_minutes+1',
  default_place_of_service CHAR(2) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_med_svc_code (agency_id, service_code),
  KEY idx_agency_med_svc_active (agency_id, is_active),
  CONSTRAINT fk_agency_med_svc_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_service_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  place_of_service CHAR(2) NOT NULL
    COMMENT 'CMS POS for this service site (02 telehealth, 10 telehealth home, 11 office, 12 home, 99 other, etc.)',
  street_address VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  state VARCHAR(32) NULL,
  postal_code VARCHAR(20) NULL,
  notes VARCHAR(500) NULL,
  requires_credentialing TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '0 = track on note only; not a credentialed billing facility',
  billing_office_location_id INT NULL
    COMMENT 'Office whose address is used as billing/pay-to when set',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_agency_svc_loc (agency_id, is_active),
  CONSTRAINT fk_agency_svc_loc_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_agency_svc_loc_billing_office FOREIGN KEY (billing_office_location_id) REFERENCES office_locations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend policy rules for overflow / max units per session / CMS POS default
ALTER TABLE billing_policy_service_rules
  ADD COLUMN max_units_per_session INT NULL AFTER max_units_per_day,
  ADD COLUMN overflow_service_code VARCHAR(32) NULL AFTER max_units_per_session,
  ADD COLUMN overflow_at_minutes INT NULL AFTER overflow_service_code,
  ADD COLUMN ladder_bands_json JSON NULL AFTER overflow_at_minutes,
  ADD COLUMN cms_place_of_service CHAR(2) NULL AFTER place_of_service;

ALTER TABLE office_events
  ADD COLUMN service_location_id INT NULL
    COMMENT 'agency_service_locations.id — service site POS for the visit';

ALTER TABLE office_booking_requests
  ADD COLUMN service_location_id INT NULL
    COMMENT 'agency_service_locations.id';
