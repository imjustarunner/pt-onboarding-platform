-- Migration 1356: Note Aid manual-write / autosign prefs (main DB)
-- Content review columns for clinical_notes live in clinical_migrations/012_*.sql

ALTER TABLE user_preferences
  ADD COLUMN note_aid_allow_manual_write TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'When 0, provider cannot skip AI — must use Note Aid generate for sections',
  ADD COLUMN note_aid_autosign_after_review TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, after content review passes, auto-apply provider signature (no supervisor required)';
