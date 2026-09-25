-- One secondary claim per primary; each has a distinct Claim.MD remote ID.
ALTER TABLE clinical_claims
 ADD COLUMN parent_claim_id BIGINT NULL,
 ADD COLUMN payer_sequence TINYINT NOT NULL DEFAULT 1,
 ADD COLUMN destination_payer_id VARCHAR(32) NULL,
 ADD COLUMN cob_payload_encrypted MEDIUMTEXT NULL,
 ADD UNIQUE KEY uq_secondary_parent (agency_id,parent_claim_id);
