-- EFT is payer-to-bank enrollment, independent of clearinghouse ERA routing.
CREATE TABLE payer_eft_enrollments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 billing_office_location_id INT NOT NULL,
 payer_id VARCHAR(32) NOT NULL,
 payer_name VARCHAR(128) NOT NULL,
 provider_npi VARCHAR(10) NOT NULL,
 tax_id_hash CHAR(64) NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'unverified',
 evidence_encrypted MEDIUMTEXT NOT NULL,
 revision INT NOT NULL DEFAULT 1,
 updated_by_user_id INT NOT NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_eft_identity (agency_id,payer_id,provider_npi,tax_id_hash),
 INDEX idx_eft_agency (agency_id,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE payer_eft_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 enrollment_id BIGINT UNSIGNED NOT NULL,
 agency_id INT NOT NULL,
 revision INT NOT NULL,
 status VARCHAR(32) NOT NULL,
 evidence_encrypted MEDIUMTEXT NOT NULL,
 created_by_user_id INT NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_eft_event_revision (enrollment_id,revision),
 INDEX idx_eft_event_agency (agency_id,enrollment_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
