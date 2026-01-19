-- Migration: Med Cancel item details
-- Add client initials and session time per missed service item.

ALTER TABLE payroll_medcancel_claim_items
  ADD COLUMN client_initials VARCHAR(16) NULL AFTER missed_service_code,
  ADD COLUMN session_time VARCHAR(16) NULL AFTER client_initials;

