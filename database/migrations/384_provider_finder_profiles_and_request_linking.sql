/*
Provider finder profile data + lightweight booking linkage fields.
*/

CREATE TABLE IF NOT EXISTS provider_public_profiles (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  public_blurb TEXT NULL,
  insurances_json JSON NULL,
  self_pay_rate_cents INT NULL,
  self_pay_rate_note VARCHAR(255) NULL,
  accepting_new_clients_override BOOLEAN NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_provider_public_profiles_user (user_id),
  CONSTRAINT fk_provider_public_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_provider_portal_settings (
  agency_id INT NOT NULL,
  finder_intro_blurb TEXT NULL,
  default_self_pay_rate_cents INT NULL,
  default_self_pay_rate_note VARCHAR(255) NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id),
  CONSTRAINT fk_agency_provider_portal_settings_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_agency_provider_portal_settings_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE public_appointment_requests
  ADD COLUMN booking_mode VARCHAR(32) NULL AFTER modality,
  ADD COLUMN program_type VARCHAR(32) NULL AFTER booking_mode,
  ADD COLUMN client_initials VARCHAR(32) NULL AFTER client_phone,
  ADD COLUMN matched_client_id INT NULL AFTER client_initials,
  ADD COLUMN created_client_id INT NULL AFTER matched_client_id,
  ADD COLUMN created_guardian_user_id INT NULL AFTER created_client_id;

ALTER TABLE public_appointment_requests
  ADD KEY idx_public_appt_requests_booking_mode (booking_mode),
  ADD KEY idx_public_appt_requests_program_type (program_type),
  ADD KEY idx_public_appt_requests_matched_client (matched_client_id),
  ADD KEY idx_public_appt_requests_created_client (created_client_id),
  ADD KEY idx_public_appt_requests_created_guardian (created_guardian_user_id);
