-- Migration: Legal hold state for admin docs
-- Purpose:
--   1) Prevent deletion while legal hold is active
--   2) Record legal hold reason and who set/released it for audit/compliance

ALTER TABLE user_admin_docs
  ADD COLUMN is_legal_hold TINYINT(1) NOT NULL DEFAULT 0 AFTER deleted_by_user_id,
  ADD COLUMN legal_hold_reason VARCHAR(1000) NULL AFTER is_legal_hold,
  ADD COLUMN legal_hold_set_at TIMESTAMP NULL AFTER legal_hold_reason,
  ADD COLUMN legal_hold_set_by_user_id INT NULL AFTER legal_hold_set_at,
  ADD COLUMN legal_hold_released_at TIMESTAMP NULL AFTER legal_hold_set_by_user_id,
  ADD COLUMN legal_hold_released_by_user_id INT NULL AFTER legal_hold_released_at,
  ADD INDEX idx_user_admin_docs_is_legal_hold (is_legal_hold),
  ADD INDEX idx_user_admin_docs_legal_hold_set_at (legal_hold_set_at),
  ADD INDEX idx_user_admin_docs_legal_hold_released_at (legal_hold_released_at);

