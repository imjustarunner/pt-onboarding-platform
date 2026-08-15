-- Migration 1221: co-guardian intake invites (second parent/guardian with legal rights)
CREATE TABLE co_guardian_invites (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  invited_by_user_id INT NULL DEFAULT NULL,
  invited_email VARCHAR(255) NOT NULL,
  invited_first_name VARCHAR(120) NULL DEFAULT NULL,
  invited_last_name VARCHAR(120) NULL DEFAULT NULL,
  invited_phone VARCHAR(40) NULL DEFAULT NULL,
  relationship_title VARCHAR(120) NULL DEFAULT NULL,
  legal_authority VARCHAR(40) NULL DEFAULT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  source VARCHAR(40) NOT NULL DEFAULT 'office',
  public_key VARCHAR(80) NULL DEFAULT NULL,
  accepted_user_id INT NULL DEFAULT NULL,
  accepted_at DATETIME NULL DEFAULT NULL,
  response_json LONGTEXT NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_co_guardian_token_hash (token_hash),
  KEY idx_co_guardian_agency_email (agency_id, invited_email),
  KEY idx_co_guardian_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE co_guardian_invite_clients (
  invite_id INT NOT NULL,
  client_id INT NOT NULL,
  PRIMARY KEY (invite_id, client_id),
  KEY idx_co_guardian_invite_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
