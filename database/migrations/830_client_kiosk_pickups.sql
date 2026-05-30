-- Migration 830: kiosk-added authorized pickups stored per client
-- Allows staff/families to add pickup contacts directly at the kiosk
-- without requiring a full guardian e-signature waiver flow.
CREATE TABLE client_kiosk_pickups (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id     INT UNSIGNED NOT NULL,
  company_event_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Optional: event context where pickup was added',
  name          VARCHAR(255) NOT NULL,
  relationship  VARCHAR(100) NULL DEFAULT NULL,
  phone         VARCHAR(30)  NULL DEFAULT NULL,
  added_by_name VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Name of person who added this contact at the kiosk',
  added_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ckp_client (client_id),
  INDEX idx_ckp_event  (company_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
