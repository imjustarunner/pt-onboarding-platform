-- Migration 1208: Outreach Hub school directory, contact log, and per-user access

ALTER TABLE users
  ADD COLUMN has_outreach_access TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Grants Outreach Hub access to non-admin users';

CREATE INDEX idx_users_has_outreach_access ON users(has_outreach_access);

CREATE TABLE outreach_schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  directory_key VARCHAR(160) NOT NULL,
  linked_organization_id INT NULL,
  name VARCHAR(255) NOT NULL,
  district_name VARCHAR(255) NOT NULL,
  city VARCHAR(128) NULL,
  region VARCHAR(128) NULL,
  school_level VARCHAR(32) NOT NULL DEFAULT 'other',
  address VARCHAR(255) NULL,
  outreach_stage VARCHAR(32) NOT NULL DEFAULT 'not_started',
  last_contact_at DATETIME NULL,
  next_follow_up_at DATE NULL,
  notes TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_outreach_directory (agency_id, directory_key),
  INDEX idx_outreach_agency_stage (agency_id, outreach_stage),
  INDEX idx_outreach_district (agency_id, district_name),
  INDEX idx_outreach_level (agency_id, school_level),
  INDEX idx_outreach_linked_org (linked_organization_id)
);

CREATE TABLE outreach_activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  outreach_school_id INT NOT NULL,
  agency_id INT NOT NULL,
  contact_type ENUM('email','letter','phone','visit') NOT NULL,
  activity_at DATETIME NOT NULL,
  summary VARCHAR(500) NULL,
  notes TEXT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_outreach_act_school (outreach_school_id, activity_at),
  INDEX idx_outreach_act_agency_type (agency_id, contact_type, activity_at),
  INDEX idx_outreach_act_agency_time (agency_id, activity_at),
  CONSTRAINT fk_outreach_act_school FOREIGN KEY (outreach_school_id)
    REFERENCES outreach_schools(id) ON DELETE CASCADE
);
