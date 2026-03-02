-- Migration: Budget expense approval workflow
-- Description: Department approvers, approval audit fields, notifications for pending approvals.

-- Add is_approver to user_department_assignments (per-department approver flag)
ALTER TABLE user_department_assignments
  ADD COLUMN is_approver TINYINT(1) NOT NULL DEFAULT 0 AFTER permissions_json;

-- Add approval audit fields to budget_expenses
ALTER TABLE budget_expenses
  ADD COLUMN approved_by_user_id INT NULL AFTER status,
  ADD COLUMN approved_at TIMESTAMP NULL AFTER approved_by_user_id,
  ADD COLUMN rejected_by_user_id INT NULL AFTER approved_at,
  ADD COLUMN rejected_at TIMESTAMP NULL AFTER rejected_by_user_id,
  ADD COLUMN rejection_note TEXT NULL AFTER rejected_at,
  ADD INDEX idx_budget_expenses_approved_by (approved_by_user_id),
  ADD FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (rejected_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
