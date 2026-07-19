-- Migration 979: Canonical appointments + participants + billing stub (unified booking Phase 1)

CREATE TABLE IF NOT EXISTS appointments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  parent_agency_id INT NULL DEFAULT NULL,
  business_type VARCHAR(64) NULL DEFAULT NULL,
  tenant_service_id INT UNSIGNED NULL DEFAULT NULL,
  provider_user_id INT NULL DEFAULT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  modality VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'IN_PERSON|TELEHEALTH|EITHER',
  office_location_id INT NULL DEFAULT NULL,
  room_id INT NULL DEFAULT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'confirmed',
  participant_mode VARCHAR(32) NOT NULL DEFAULT 'individual'
    COMMENT 'individual|multi',
  office_event_id INT NULL DEFAULT NULL,
  provider_schedule_event_id INT NULL DEFAULT NULL,
  clinical_session_id INT NULL DEFAULT NULL
    COMMENT 'Reference only; PHI stays in clinical plane',
  package_entitlement_id INT NULL DEFAULT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'staff_grid'
    COMMENT 'staff_grid|public|package|office_book|import|other',
  title VARCHAR(255) NULL DEFAULT NULL,
  notes TEXT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  updated_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appointments_agency_start (agency_id, start_at),
  KEY idx_appointments_provider_start (provider_user_id, start_at),
  KEY idx_appointments_office_event (office_event_id),
  KEY idx_appointments_pse (provider_schedule_event_id),
  KEY idx_appointments_status (agency_id, status),
  KEY idx_appointments_service (tenant_service_id),
  CONSTRAINT fk_appointments_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_appointments_service
    FOREIGN KEY (tenant_service_id) REFERENCES tenant_services(id) ON DELETE SET NULL,
  CONSTRAINT fk_appointments_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointment_participants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id INT UNSIGNED NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'client'
    COMMENT 'client|guardian|student|org_contact|other',
  client_id INT NULL DEFAULT NULL,
  user_id INT NULL DEFAULT NULL,
  display_name VARCHAR(255) NULL DEFAULT NULL,
  is_billing_responsible TINYINT(1) NOT NULL DEFAULT 0,
  receives_reminders TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appt_participants_appt (appointment_id),
  KEY idx_appt_participants_client (client_id),
  CONSTRAINT fk_appt_participants_appt
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointment_billing (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id INT UNSIGNED NOT NULL,
  settlement_mode VARCHAR(64) NOT NULL DEFAULT 'self_pay'
    COMMENT 'self_pay|package|insurance|org|grant|other',
  responsible_party_type VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'client|guardian|org|school|sponsor|other',
  responsible_client_id INT NULL DEFAULT NULL,
  amount_cents INT NULL DEFAULT NULL,
  package_entitlement_id INT NULL DEFAULT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  payment_status VARCHAR(64) NOT NULL DEFAULT 'none'
    COMMENT 'none|pending|paid|waived|review',
  notes VARCHAR(500) NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_appointment_billing_appt (appointment_id),
  CONSTRAINT fk_appointment_billing_appt
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
