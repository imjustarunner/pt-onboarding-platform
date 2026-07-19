-- Migration 971: Dual-rate Log Time — pay_bucket on service types, user flag, other_1 claim bucket

ALTER TABLE payroll_indirect_service_types
  ADD COLUMN pay_bucket ENUM('indirect','other_1') NOT NULL DEFAULT 'indirect'
  COMMENT 'Which hourly rate slot this activity uses on dual-rate contracts'
  AFTER icon_key;

ALTER TABLE users
  ADD COLUMN hourly_dual_rate_enabled TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1 with is_hourly_worker: Log Time splits Indirect vs Other 1'
  AFTER is_hourly_worker;

ALTER TABLE payroll_time_claims
  MODIFY COLUMN bucket ENUM('direct','indirect','other_1') NOT NULL DEFAULT 'indirect';
