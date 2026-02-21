-- Migration: Add actor_source to notifications
-- Description: When no human actor (actor_user_id), store system/source label (e.g. "Payroll", "System", "Kiosk")

ALTER TABLE notifications
  ADD COLUMN actor_source VARCHAR(100) NULL COMMENT 'System/source label when no human actor (e.g. Payroll, Kiosk, Automation)' AFTER actor_user_id;
