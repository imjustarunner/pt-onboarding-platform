-- Migration: Soft-remove user checklist assignments
-- Description: Allow backoffice admins to hide/remove assigned checklist items from a user's record without the system re-creating them.

ALTER TABLE user_custom_checklist_assignments
  ADD COLUMN is_removed BOOLEAN DEFAULT FALSE AFTER is_completed,
  ADD COLUMN removed_at TIMESTAMP NULL AFTER is_removed,
  ADD COLUMN removed_by_user_id INT NULL AFTER removed_at,
  ADD CONSTRAINT fk_ucca_removed_by_user
    FOREIGN KEY (removed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_ucca_is_removed ON user_custom_checklist_assignments (is_removed);

