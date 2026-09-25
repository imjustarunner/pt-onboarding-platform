-- Append-only policy versions; references/attestations must not contain patient information.
ALTER TABLE billing_claim_overrides
 ADD COLUMN payer_id VARCHAR(32) NULL,
 ADD COLUMN plan_type VARCHAR(100) NULL,
 ADD COLUMN effective_from DATE NULL,
 ADD COLUMN effective_through DATE NULL,
 ADD COLUMN policy_reference VARCHAR(1000) NULL;

CREATE TABLE IF NOT EXISTS billing_claim_override_audit (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 override_id INT NOT NULL,
 actor_user_id INT NOT NULL,
 payload_encrypted MEDIUMTEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_override_audit (agency_id, override_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clinical_supervision_policies (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 provider_user_id INT NOT NULL,
 supervisor_user_id INT NOT NULL,
 policy_json JSON NOT NULL,
 changed_by_user_id INT NOT NULL,
 reason VARCHAR(1000) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_supervision_policy (agency_id, provider_user_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing_payer_policy_versions (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 payer_id VARCHAR(32) NOT NULL,
 plan_type VARCHAR(100) NOT NULL,
 policy_json JSON NOT NULL,
 changed_by_user_id INT NOT NULL,
 reason VARCHAR(1000) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_billing_payer_policy (agency_id, payer_id, plan_type, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supervision_review_time (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 supervisor_user_id INT NOT NULL,
 supervisee_user_id INT NOT NULL,
 start_at DATETIME NOT NULL,
 end_at DATETIME NOT NULL,
 timezone VARCHAR(80) NOT NULL,
 status ENUM('planned','attested','void') NOT NULL DEFAULT 'planned',
 activity_type ENUM('documentation_review','rendering_provider_oversight') NOT NULL,
 document_refs_json JSON NOT NULL,
 attested_at DATETIME NULL,
 voided_at DATETIME NULL,
 void_reason VARCHAR(1000) NULL,
 request_id VARCHAR(64) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_review_request (supervisor_user_id, request_id),
 INDEX idx_review_overlap (supervisor_user_id, start_at, end_at),
 INDEX idx_review_supervisee (agency_id, supervisee_user_id, start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clinical_document_reviews (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 provider_user_id INT NOT NULL,
 supervisor_user_id INT NOT NULL,
 document_type ENUM('note','treatment_plan') NOT NULL,
 document_id BIGINT NOT NULL,
 content_hash CHAR(64) NOT NULL,
 outcome ENUM('approved','changes_requested') NOT NULL,
 feedback_encrypted MEDIUMTEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_document_review (agency_id, document_type, document_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
