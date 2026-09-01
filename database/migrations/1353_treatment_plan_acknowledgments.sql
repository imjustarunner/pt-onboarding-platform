-- Migration 1353: treatment plan client acknowledgment links + audit events
CREATE TABLE IF NOT EXISTS treatment_plan_ack_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  treatment_plan_id INT NOT NULL COMMENT 'clinical_treatment_plans.id (clinical DB)',
  public_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  channel ENUM('dashboard_share','provider_session','email_link','print_upload')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  status ENUM('issued','sent','opened','viewed','signed','expired','cancelled')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
  recipient_kind ENUM('client','guardian')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'client',
  recipient_user_id INT NULL DEFAULT NULL,
  recipient_email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  recipient_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  issued_by_user_id INT NULL DEFAULT NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL DEFAULT NULL,
  first_opened_at DATETIME NULL DEFAULT NULL,
  last_opened_at DATETIME NULL DEFAULT NULL,
  open_count INT NOT NULL DEFAULT 0,
  signed_at DATETIME NULL DEFAULT NULL,
  signed_by_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  signature_image_path VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  witness_user_id INT NULL DEFAULT NULL,
  witness_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  witness_signed_at DATETIME NULL DEFAULT NULL,
  uploaded_phi_document_id INT NULL DEFAULT NULL,
  dashboard_visible TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NULL DEFAULT NULL,
  meta_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tp_ack_public_key (public_key),
  KEY idx_tp_ack_client_plan (client_id, treatment_plan_id),
  KEY idx_tp_ack_agency_status (agency_id, status),
  KEY idx_tp_ack_dashboard (client_id, dashboard_visible, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS treatment_plan_ack_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ack_link_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'issued, emailed, shared_dashboard, session_started, opened, viewed, signed, upload_attached, cancelled, expired',
  actor_user_id INT NULL DEFAULT NULL,
  actor_label VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  ip_hash VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  user_agent VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  meta_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tp_ack_events_link (ack_link_id, created_at),
  CONSTRAINT fk_tp_ack_events_link
    FOREIGN KEY (ack_link_id) REFERENCES treatment_plan_ack_links (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
