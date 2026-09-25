-- Only for the disposable patient_service_test suite, after family-ledger-workflows.sql.
ALTER TABLE clinical_sessions ADD COLUMN service_code VARCHAR(32), ADD COLUMN effective_service_code VARCHAR(32), ADD COLUMN billed_units DECIMAL(8,2);
ALTER TABLE clinical_claims ADD COLUMN parent_claim_id BIGINT NULL, ADD COLUMN payer_sequence INT DEFAULT 1, ADD COLUMN destination_payer_id VARCHAR(80);
CREATE TABLE clinical_claim_change_requests(id BIGINT PRIMARY KEY,agency_id INT,clinical_session_id BIGINT,status VARCHAR(40));
