-- Phase 3 auditability fields for inbound email draft workflow.

ALTER TABLE support_tickets
  ADD COLUMN email_ingested_at DATETIME NULL AFTER source_email_received_at,
  ADD COLUMN draft_generated_at DATETIME NULL AFTER ai_draft_generated_at,
  ADD COLUMN approved_by_user_id INT NULL AFTER ai_draft_reviewed_at,
  ADD COLUMN sent_at DATETIME NULL AFTER approved_by_user_id;

ALTER TABLE support_tickets
  ADD INDEX idx_support_tickets_email_ingested_at (email_ingested_at),
  ADD INDEX idx_support_tickets_sent_at (sent_at),
  ADD INDEX idx_support_tickets_approved_by_user_id (approved_by_user_id);

ALTER TABLE support_tickets
  ADD CONSTRAINT fk_support_tickets_approved_by_user_id
    FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
