-- Prelicensed supervision settings (per-user, per-agency)
-- Used to (a) accrue 99414/99416 supervision hours and (b) gate pay for those codes until thresholds are met.

ALTER TABLE user_agencies
  ADD COLUMN supervision_is_prelicensed TINYINT(1) NOT NULL DEFAULT 0 AFTER h0032_requires_manual_minutes,
  ADD COLUMN supervision_start_date DATE NULL AFTER supervision_is_prelicensed,
  ADD COLUMN supervision_start_individual_hours DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER supervision_start_date,
  ADD COLUMN supervision_start_group_hours DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER supervision_start_individual_hours;

CREATE INDEX idx_user_agencies_supervision_prelicensed
  ON user_agencies (agency_id, supervision_is_prelicensed, user_id);

