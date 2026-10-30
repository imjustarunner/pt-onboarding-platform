-- Profile-only evidence from payroll billing reports. Source PHI is encrypted;
-- these records never create services, encounters, clinical sessions or clients.
CREATE TABLE IF NOT EXISTS billing_client_profile_observations (
 id BIGINT NOT NULL AUTO_INCREMENT,
 agency_id INT NOT NULL,
 -- Immutable logical source ID: deleting raw imports must not erase profile-change evidence.
 payroll_import_id INT NOT NULL,
 source_row_number INT NOT NULL,
 row_fingerprint CHAR(64) NOT NULL,
 client_id INT NULL,
 source_service_date DATE NULL,
 match_status VARCHAR(32) NOT NULL,
 match_method VARCHAR(48) NULL,
 observed_fields_payload JSON NOT NULL,
 changed_fields_json JSON NOT NULL,
 reason_codes_json JSON NOT NULL,
 created_by_user_id INT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (id),
 UNIQUE KEY uq_billing_profile_import_row (agency_id,payroll_import_id,source_row_number,row_fingerprint),
 KEY idx_billing_profile_client (agency_id,client_id,created_at),
 KEY idx_billing_profile_fingerprint (agency_id,row_fingerprint),
 CONSTRAINT fk_billing_profile_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
 CONSTRAINT fk_billing_profile_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
 CONSTRAINT fk_billing_profile_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
