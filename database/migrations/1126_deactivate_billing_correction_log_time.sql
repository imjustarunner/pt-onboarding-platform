-- Migration 1126: Remove Billing Correction / Claim Resolution from Log Time picker

UPDATE payroll_indirect_service_types
SET is_active = 0
WHERE type_key = 'billing_correction';
