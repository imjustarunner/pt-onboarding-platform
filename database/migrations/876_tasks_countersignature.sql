-- Migration 876: Add countersignature columns to tasks for multi-signer contract workflow
ALTER TABLE tasks
  ADD COLUMN countersign_signer_user_id INT NULL
    COMMENT 'The staff user who must countersign this document task'
    AFTER metadata,
  ADD COLUMN countersign_role_label VARCHAR(100) NULL
    COMMENT 'Display label for the countersigner role (e.g. Hiring Manager)'
    AFTER countersign_signer_user_id,
  ADD COLUMN countersign_signed_at TIMESTAMP NULL
    COMMENT 'Timestamp when the staff member completed their countersignature'
    AFTER countersign_role_label,
  ADD COLUMN countersign_field_key VARCHAR(100) NULL
    COMMENT 'The field_definitions key for the countersignature field on the document'
    AFTER countersign_signed_at,
  ADD FOREIGN KEY fk_tasks_countersign_user (countersign_signer_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_countersign_signer ON tasks(countersign_signer_user_id);
