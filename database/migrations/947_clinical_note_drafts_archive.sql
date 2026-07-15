-- Migration 947: Soft archive status for clinical note drafts (still deleted after 7-day TTL)

ALTER TABLE clinical_note_drafts
  ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL
  COMMENT 'When set, draft is in the Archived shelf; still hard-deleted by created_at TTL';

ALTER TABLE clinical_note_drafts
  ADD INDEX idx_cnd_user_archived_created (user_id, archived_at, created_at);
