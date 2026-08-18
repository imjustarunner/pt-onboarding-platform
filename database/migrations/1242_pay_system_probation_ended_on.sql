-- Migration 1242: Track when 90-day probation actually ended for a staff member.
-- Used so services before that date keep probation rates and services on/after use current rates.
ALTER TABLE payroll_user_compensation_levels
  ADD COLUMN probation_ended_on DATE NULL DEFAULT NULL
    COMMENT 'First day at current (non-probation) rates when probation is ended early; NULL = auto 90 days from start or grandfathered'
    AFTER probation_start_override;
