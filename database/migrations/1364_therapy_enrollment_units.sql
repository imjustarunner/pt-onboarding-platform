-- Migration 1364: therapy enrollment units (couple / family) linking separate client records
-- Individual people stay on clients; shared relationship/case links them without merging clinical data.

CREATE TABLE IF NOT EXISTS therapy_enrollment_units (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  unit_type ENUM('couple', 'family') NOT NULL,
  pathway VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'e.g. quick_prospective, full_office_intake',
  primary_contact_client_id INT NULL DEFAULT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'prospective',
  meta_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_teu_agency_type (agency_id, unit_type),
  KEY idx_teu_primary_client (primary_contact_client_id),
  CONSTRAINT fk_teu_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_teu_primary_client FOREIGN KEY (primary_contact_client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS therapy_enrollment_unit_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_id BIGINT UNSIGNED NOT NULL,
  client_id INT NOT NULL,
  member_role VARCHAR(64) NOT NULL DEFAULT 'participant'
    COMMENT 'partner_1, partner_2, primary_contact, adult, minor, etc.',
  participation_status VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'participating | may_participate | not_participating | expected_regular',
  relationship_to_primary VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  notify_about_request TINYINT(1) NULL DEFAULT NULL
    COMMENT 'Couple: whether partner should receive request communications',
  same_address_as_primary TINYINT(1) NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  meta_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teu_member_client (unit_id, client_id),
  KEY idx_teu_members_client (client_id),
  CONSTRAINT fk_teum_unit FOREIGN KEY (unit_id) REFERENCES therapy_enrollment_units(id) ON DELETE CASCADE,
  CONSTRAINT fk_teum_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
