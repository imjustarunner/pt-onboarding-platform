-- Migration 1210: Outreach trips, contacts, notes, and school coordinates

ALTER TABLE outreach_schools
  ADD COLUMN lat DECIMAL(10, 7) NULL
  COMMENT 'Geocoded latitude for trip routing',
  ADD COLUMN lng DECIMAL(10, 7) NULL
  COMMENT 'Geocoded longitude for trip routing',
  ADD COLUMN primary_contact_name VARCHAR(255) NULL
  COMMENT 'Primary school outreach contact',
  ADD COLUMN primary_contact_email VARCHAR(255) NULL,
  ADD COLUMN primary_contact_phone VARCHAR(64) NULL,
  ADD COLUMN primary_contact_title VARCHAR(128) NULL,
  ADD COLUMN agency_contact_id INT NULL
  COMMENT 'Linked row in agency_contacts';

CREATE TABLE outreach_school_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  outreach_school_id INT NOT NULL,
  agency_id INT NOT NULL,
  body TEXT NOT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_oh_notes_school (outreach_school_id, created_at),
  CONSTRAINT fk_oh_notes_school FOREIGN KEY (outreach_school_id)
    REFERENCES outreach_schools(id) ON DELETE CASCADE
);

CREATE TABLE outreach_school_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  outreach_school_id INT NOT NULL,
  agency_id INT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  title VARCHAR(128) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  agency_contact_id INT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_oh_contacts_school (outreach_school_id, is_primary),
  CONSTRAINT fk_oh_contacts_school FOREIGN KEY (outreach_school_id)
    REFERENCES outreach_schools(id) ON DELETE CASCADE
);

CREATE TABLE outreach_trips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  title VARCHAR(255) NULL,
  status ENUM('planned','in_progress','completed','cancelled') NOT NULL DEFAULT 'planned',
  origin_label VARCHAR(255) NOT NULL DEFAULT 'Windchime (main office)',
  origin_address VARCHAR(255) NOT NULL DEFAULT '437 Windchime Place, Colorado Springs, CO 80919',
  planned_date DATE NULL,
  completed_at DATETIME NULL,
  notes TEXT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_oh_trips_agency (agency_id, status, planned_date)
);

CREATE TABLE outreach_trip_stops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trip_id INT NOT NULL,
  outreach_school_id INT NOT NULL,
  stop_order INT NOT NULL,
  miles_from_prev DECIMAL(8, 2) NULL,
  duration_seconds INT NULL,
  INDEX idx_oh_trip_stops (trip_id, stop_order),
  CONSTRAINT fk_oh_trip_stops_trip FOREIGN KEY (trip_id)
    REFERENCES outreach_trips(id) ON DELETE CASCADE,
  CONSTRAINT fk_oh_trip_stops_school FOREIGN KEY (outreach_school_id)
    REFERENCES outreach_schools(id) ON DELETE CASCADE
);

CREATE TABLE outreach_trip_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trip_id INT NOT NULL,
  user_id INT NULL,
  display_name VARCHAR(255) NOT NULL,
  start_time DATETIME NULL,
  end_time DATETIME NULL,
  INDEX idx_oh_trip_parts (trip_id),
  CONSTRAINT fk_oh_trip_parts_trip FOREIGN KEY (trip_id)
    REFERENCES outreach_trips(id) ON DELETE CASCADE
);
