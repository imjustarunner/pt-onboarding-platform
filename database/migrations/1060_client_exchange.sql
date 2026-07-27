-- Migration 1060: Client Exchange (Office clients) — anonymized listings + requests
--
-- Lets a provider (or support/admin) post an office/clinical client that needs a new
-- provider (schedule conflict, fit, relocation, etc.) without exposing the client's
-- identity to browsing providers. Other providers can request the assignment; the
-- current provider (or support/admin) approves or denies.

CREATE TABLE IF NOT EXISTS client_exchange_listings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NULL
    COMMENT 'Nullable so a listing can be withdrawn/closed without cascading the client row away',
  posted_by_user_id INT NOT NULL,
  current_provider_user_id INT NULL,
  status ENUM('open', 'requested', 'approved', 'withdrawn', 'closed') NOT NULL DEFAULT 'open',
  demographics_json JSON NULL
    COMMENT 'Anonymized: age band, gender, grade, general location — never name/DOB/contact',
  presenting_problems_json JSON NULL,
  diagnoses_json JSON NULL,
  preferences_json JSON NULL
    COMMENT 'Modality, availability, insurance, language, etc.',
  notes TEXT NULL,
  closed_at DATETIME NULL,
  closed_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cel_agency_status (agency_id, status),
  KEY idx_cel_client (client_id),
  KEY idx_cel_posted_by (posted_by_user_id),
  KEY idx_cel_current_provider (current_provider_user_id),
  CONSTRAINT fk_cel_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_cel_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_cel_posted_by FOREIGN KEY (posted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cel_current_provider FOREIGN KEY (current_provider_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cel_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_exchange_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  listing_id BIGINT UNSIGNED NOT NULL,
  requesting_provider_user_id INT NOT NULL,
  status ENUM('pending', 'approved', 'denied', 'withdrawn') NOT NULL DEFAULT 'pending',
  message TEXT NULL,
  resolved_by_user_id INT NULL,
  resolved_at DATETIME NULL,
  denial_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cer_listing (listing_id, status),
  KEY idx_cer_requesting_provider (requesting_provider_user_id),
  CONSTRAINT fk_cer_listing FOREIGN KEY (listing_id) REFERENCES client_exchange_listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_cer_requesting_provider FOREIGN KEY (requesting_provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cer_resolved_by FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preferred time/place captured at digital (office) intake, before a provider is assigned.
-- Written without IF NOT EXISTS for MySQL 5.7 compatibility; the migration runner
-- skips Duplicate column name errors automatically.
ALTER TABLE clients ADD COLUMN intake_preferences_json JSON NULL
  COMMENT 'Preferred day/time, location/modality, and other digital-intake preferences captured before provider assignment';
