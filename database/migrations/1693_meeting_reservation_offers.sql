CREATE TABLE IF NOT EXISTS meeting_reservation_offers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  host_user_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  revision INT NOT NULL DEFAULT 1,
  config_json JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_meeting_offer_host (host_user_id,agency_id,status),
  KEY idx_meeting_offer_expiry (status,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meeting_reservation_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  offer_id BIGINT UNSIGNED NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  hold_end_at DATETIME NOT NULL,
  event_id INT NOT NULL,
  buffer_event_id INT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  UNIQUE KEY uq_meeting_offer_time (offer_id,start_at),
  UNIQUE KEY uq_meeting_offer_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meeting_reservation_invitees (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  offer_id BIGINT UNSIGNED NOT NULL,
  user_id INT NULL,
  recipient_key VARCHAR(320) NOT NULL,
  display_name VARCHAR(150) NOT NULL,
  email VARCHAR(254) NULL,
  token_hash CHAR(64) NOT NULL,
  token_payload TEXT NOT NULL,
  first_viewed_at DATETIME NULL,
  slot_id BIGINT UNSIGNED NULL,
  booked_at DATETIME NULL,
  booking_snapshot CHAR(64) NULL,
  UNIQUE KEY uq_meeting_invitee (offer_id,recipient_key),
  UNIQUE KEY uq_meeting_invitation_token (token_hash),
  UNIQUE KEY uq_meeting_claim (slot_id),
  KEY idx_meeting_invitee_user (user_id,offer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meeting_reservation_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invitee_id BIGINT UNSIGNED NOT NULL,
  delivery_key VARCHAR(100) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  communication_id INT NULL,
  error_message VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_meeting_reservation_delivery (invitee_id,delivery_key),
  KEY idx_meeting_reservation_due (status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
