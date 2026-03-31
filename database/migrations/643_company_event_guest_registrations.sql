-- Guest registrations for people who RSVP'd via the public event page
-- but could not be matched to an existing user account.
-- Admins can review these and manually link them to accounts later.

CREATE TABLE IF NOT EXISTS company_event_guest_registrations (
  id INT NOT NULL AUTO_INCREMENT,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NULL,
  response ENUM('yes', 'no', 'maybe') NOT NULL,
  guest_count INT NOT NULL DEFAULT 1,
  dietary_notes TEXT NULL,
  notes TEXT NULL,
  matched_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_cegr_event (company_event_id),
  INDEX idx_cegr_agency (agency_id),
  INDEX idx_cegr_email (email),
  INDEX idx_cegr_matched_user (matched_user_id),
  CONSTRAINT fk_cegr_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_cegr_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_cegr_matched_user
    FOREIGN KEY (matched_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
