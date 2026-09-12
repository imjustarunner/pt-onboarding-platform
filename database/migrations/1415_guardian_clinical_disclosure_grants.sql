CREATE TABLE guardian_clinical_grants (
 agency_id INT NOT NULL, client_id INT NOT NULL, guardian_user_id INT NOT NULL,
 access_level ENUM('full','limited','payer_only') NOT NULL DEFAULT 'payer_only',
 medical_rights_verified TINYINT NOT NULL DEFAULT 0,
 consent_basis ENUM('legal_representative','minor_independent_consent','client_authorization','payer_only') NOT NULL DEFAULT 'payer_only',
 scopes_json JSON NOT NULL,
 evidence_encrypted LONGTEXT NOT NULL,
 reviewed_by_user_id INT NOT NULL,
 reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 review_due_date DATE NULL,
 revoked_at DATETIME NULL,
 PRIMARY KEY(agency_id,client_id,guardian_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE guardian_clinical_access_events (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, agency_id INT NOT NULL, client_id INT NOT NULL,
 guardian_user_id INT NOT NULL, actor_user_id INT NOT NULL, action VARCHAR(50) NOT NULL,
 evidence_encrypted LONGTEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_guardian_access_events(agency_id,client_id,guardian_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
