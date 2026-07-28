-- Migration 1088: Deactivate "Other Indirect" hourly service type
-- Employees should not submit generic other-indirect time; historical claims keep the label.

UPDATE payroll_indirect_service_types
SET is_active = 0
WHERE type_key = 'other_indirect';
