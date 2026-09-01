-- Clinical migration 011: client acknowledgment status on treatment plans
ALTER TABLE clinical_treatment_plans
  ADD COLUMN client_ack_status VARCHAR(32) NULL DEFAULT NULL
  COMMENT 'pending|shared|signed|paper_on_file — client/guardian acknowledgment of this plan',
  ADD COLUMN client_ack_at DATETIME NULL DEFAULT NULL
  COMMENT 'When the client/guardian acknowledgment was completed';
