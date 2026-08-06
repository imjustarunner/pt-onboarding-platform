-- Migration 1143: Agency flag to enable the new pay system
-- When enabled, enrolled users are paid via payroll_pay_system_rates instead of
-- the legacy rate-card / per-code lookup path.

ALTER TABLE agencies
  ADD COLUMN new_pay_system_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=new category/level pay system active for enrolled users'
    AFTER tier_thresholds_json;
