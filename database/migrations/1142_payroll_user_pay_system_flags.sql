-- Migration 1142: Per-user flags for the new pay system
-- Enroll users, waive probation/MWR, override probation start, mark Spanish bonus eligible.

ALTER TABLE payroll_user_compensation_levels
  ADD COLUMN pay_system_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=enrolled in new pay system (rates from payroll_pay_system_rates)'
    AFTER bypass,
  ADD COLUMN waive_probation TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=skip 90-day probationary rate (grandfathered / waived)'
    AFTER pay_system_enabled,
  ADD COLUMN waive_minimum_workload TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=never drop to Minimum Workload Rate when below Tier 1'
    AFTER waive_probation,
  ADD COLUMN probation_start_override DATE NULL DEFAULT NULL
    COMMENT 'Optional override for 90-day probation start (defaults to provider_start_date)'
    AFTER waive_minimum_workload,
  ADD COLUMN spanish_bonus_eligible TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=eligible for Spanish-speaking tier bonus'
    AFTER probation_start_override;
