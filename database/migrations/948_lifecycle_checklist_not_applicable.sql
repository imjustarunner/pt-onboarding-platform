-- Migration 948: Per-person lifecycle checklist "not needed" (excluded from completion math)

ALTER TABLE user_lifecycle_checklist_items
  ADD COLUMN is_not_applicable TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'HR marked not needed for this person; excluded from completion progress',
  ADD COLUMN not_applicable_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When this item was marked not applicable',
  ADD COLUMN not_applicable_by_user_id INT NULL DEFAULT NULL
    COMMENT 'User id who marked this item not applicable';
