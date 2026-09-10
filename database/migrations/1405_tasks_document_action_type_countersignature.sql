-- Migration 1405: allow countersignature tasks on hire contracts
-- Start Pre-Hire creates internal signer todos with document_action_type = 'countersignature'.
-- The tasks ENUM previously only allowed signature/review/acroform, which truncated the value.
ALTER TABLE tasks
  MODIFY COLUMN document_action_type ENUM('signature', 'review', 'acroform', 'countersignature')
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  NULL
  COMMENT 'For document tasks: candidate signature, review, acroform, or internal countersignature';
