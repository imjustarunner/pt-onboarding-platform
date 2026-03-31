-- Migration 640: Staff event extensions for company events
-- Adds guest policy + RSVP metadata + internal event media fields,
-- and creates invitation + need-list tables.

ALTER TABLE company_events
  ADD COLUMN guest_policy ENUM('staff_only','family_invited','plus_one') NOT NULL DEFAULT 'staff_only',
  ADD COLUMN potluck_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN organizer_providing_json JSON NULL,
  ADD COLUMN event_image_url VARCHAR(500) NULL,
  ADD COLUMN event_image_urls_json JSON NULL,
  ADD COLUMN rsvp_deadline DATETIME NULL,
  ADD COLUMN event_location_name VARCHAR(255) NULL,
  ADD COLUMN event_location_address VARCHAR(500) NULL,
  ADD COLUMN event_location_phone VARCHAR(64) NULL,
  ADD COLUMN family_provision_note TEXT NULL,
  ADD COLUMN registration_form_url VARCHAR(2048) NULL,
  ADD COLUMN sms_draft_json JSON NULL;

CREATE TABLE IF NOT EXISTS company_event_need_list_items (
  id INT NOT NULL AUTO_INCREMENT,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_notes TEXT NULL,
  claimed_by_user_id INT NULL,
  claimed_at DATETIME NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_need_list_event (company_event_id),
  INDEX idx_need_list_agency (agency_id),
  INDEX idx_need_list_claimed_by (claimed_by_user_id),
  CONSTRAINT fk_need_list_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_need_list_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_need_list_claimed_by
    FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_need_list_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_event_invitations (
  id INT NOT NULL AUTO_INCREMENT,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL,
  response ENUM('yes','no','maybe') NULL,
  responded_at DATETIME NULL,
  email_sent_at DATETIME NULL,
  registration_payload_json JSON NULL,
  registration_submitted_at DATETIME NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_event_invitation_token (token),
  UNIQUE KEY uq_company_event_invitation_user (company_event_id, user_id),
  INDEX idx_company_event_invitation_agency (agency_id),
  INDEX idx_company_event_invitation_response (company_event_id, response),
  CONSTRAINT fk_company_event_invitation_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_event_invitation_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_event_invitation_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_event_invitation_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
