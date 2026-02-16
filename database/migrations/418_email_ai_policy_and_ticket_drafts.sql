-- Agency-level inbound email AI policy + school overrides.
-- Also extends support_tickets for inbound email draft workflow/audit.

ALTER TABLE agency_email_settings
  ADD COLUMN ai_draft_policy_mode VARCHAR(64) NOT NULL DEFAULT 'human_only' AFTER notifications_enabled,
  ADD COLUMN allow_school_overrides TINYINT(1) NOT NULL DEFAULT 1 AFTER ai_draft_policy_mode;

CREATE TABLE IF NOT EXISTS school_email_ai_policy_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  policy_mode VARCHAR(64) NOT NULL DEFAULT 'human_only',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_email_ai_policy_overrides_school (school_organization_id),
  INDEX idx_school_email_ai_policy_overrides_agency (agency_id),
  CONSTRAINT fk_school_email_ai_policy_overrides_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_email_ai_policy_overrides_school
    FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_email_ai_policy_overrides_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE support_tickets
  ADD COLUMN source_channel VARCHAR(24) NOT NULL DEFAULT 'portal' AFTER agency_id,
  ADD COLUMN source_email_from VARCHAR(255) NULL AFTER source_channel,
  ADD COLUMN source_email_subject VARCHAR(255) NULL AFTER source_email_from,
  ADD COLUMN source_email_message_id VARCHAR(255) NULL AFTER source_email_subject,
  ADD COLUMN source_email_thread_id VARCHAR(255) NULL AFTER source_email_message_id,
  ADD COLUMN source_email_received_at DATETIME NULL AFTER source_email_thread_id,
  ADD COLUMN ai_draft_response TEXT NULL AFTER answer,
  ADD COLUMN ai_draft_confidence DECIMAL(5,4) NULL AFTER ai_draft_response,
  ADD COLUMN ai_draft_status VARCHAR(32) NULL AFTER ai_draft_confidence,
  ADD COLUMN ai_draft_metadata_json JSON NULL AFTER ai_draft_status,
  ADD COLUMN ai_draft_generated_at DATETIME NULL AFTER ai_draft_metadata_json,
  ADD COLUMN ai_draft_review_state VARCHAR(24) NULL AFTER ai_draft_generated_at,
  ADD COLUMN ai_draft_review_note TEXT NULL AFTER ai_draft_review_state,
  ADD COLUMN ai_draft_reviewed_by_user_id INT NULL AFTER ai_draft_review_note,
  ADD COLUMN ai_draft_reviewed_at DATETIME NULL AFTER ai_draft_reviewed_by_user_id,
  ADD COLUMN escalation_reason VARCHAR(128) NULL AFTER ai_draft_reviewed_at;

ALTER TABLE support_tickets
  ADD INDEX idx_support_tickets_source_channel (source_channel),
  ADD INDEX idx_support_tickets_source_email_received_at (source_email_received_at),
  ADD INDEX idx_support_tickets_ai_draft_review_state (ai_draft_review_state);

ALTER TABLE support_tickets
  ADD CONSTRAINT fk_support_tickets_ai_draft_reviewed_by
    FOREIGN KEY (ai_draft_reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
