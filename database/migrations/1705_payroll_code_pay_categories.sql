-- Payroll-managed new-system categories are separate from legacy reporting buckets.
ALTER TABLE payroll_service_code_rules ADD COLUMN pay_system_bucket ENUM('credit','hcode','indirect','support_activity','skip') NULL;
