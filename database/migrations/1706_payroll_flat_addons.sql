-- Flat add-ons are money per eligible occurrence, never credits or hours.
ALTER TABLE payroll_service_code_rules
  MODIFY COLUMN pay_system_bucket ENUM('credit','hcode','indirect','support_activity','skip','flat') NULL,
  ADD COLUMN flat_rate_amount DECIMAL(10,2) NULL;
-- Tenant policy activation is audited separately; do not rewrite posted payroll.
