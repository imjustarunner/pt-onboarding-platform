-- Migration 872: Optional client_id tag on office_questionnaire_responses
-- Allows providers to link a questionnaire response to a client on their caseload after the fact.
-- This column is NEVER exposed on any public kiosk endpoint; only accessible via authenticated
-- provider-facing API routes.

ALTER TABLE office_questionnaire_responses
  ADD COLUMN client_id INT NULL
    COMMENT 'Provider-tagged client link; NEVER exposed on kiosk public endpoints'
    AFTER provider_id,
  ADD CONSTRAINT fk_office_qr_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  ADD INDEX idx_office_qr_client (client_id);
