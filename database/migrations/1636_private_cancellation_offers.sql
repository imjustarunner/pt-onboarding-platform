CREATE TABLE IF NOT EXISTS appointment_replacement_offers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id INT UNSIGNED NOT NULL,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  client_id INT NOT NULL,
  mode VARCHAR(24) NOT NULL,
  slots_json JSON NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  expires_at DATETIME NOT NULL,
  created_by_user_id INT NULL,
  responded_by_user_id INT NULL,
  responded_at DATETIME NULL,
  request_id INT NULL,
  selected_slot_id BIGINT UNSIGNED NULL,
  linked_appointment_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_replacement_offer_appointment_client (appointment_id,client_id),
  KEY idx_replacement_offer_client (client_id,status,expires_at),
  KEY idx_replacement_offer_selected (selected_slot_id),
  KEY idx_replacement_offer_request (agency_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointment_replacement_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  modality VARCHAR(24) NOT NULL,
  room_id INT NOT NULL DEFAULT 0,
  slot_json JSON NOT NULL,
  released_at DATETIME NULL,
  released_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_replacement_slot (agency_id,provider_id,start_at,end_at,modality,room_id),
  KEY idx_replacement_slot_window (provider_id,start_at,end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointment_replacement_offer_slots (
  offer_id BIGINT UNSIGNED NOT NULL,
  slot_id BIGINT UNSIGNED NOT NULL,
  released_at DATETIME NULL,
  released_by_user_id INT NULL,
  PRIMARY KEY (offer_id,slot_id),
  KEY idx_replacement_pool_slot (slot_id,offer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_communications MODIFY COLUMN channel ENUM('email','sms','in_app') DEFAULT 'email';
