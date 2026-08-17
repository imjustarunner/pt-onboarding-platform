-- Migration 1230: pay-system effective start + pending level changes + clearer FFS/H tier bonuses
-- Enables deferred "Go" activation and optional separate tier bonuses for FFS vs H-code productive hours.

ALTER TABLE payroll_user_compensation_levels
  ADD COLUMN pay_system_effective_start DATE NULL DEFAULT NULL
    COMMENT 'When set, new pay system rates apply only to payroll periods ending on/after this date';

ALTER TABLE payroll_pay_system_rates
  ADD COLUMN tier_bonus_ffs_json JSON NULL
    COMMENT 'Optional tier bonus $/credit for FFS (credit) productive hours; falls back to tier_bonus_json',
  ADD COLUMN tier_bonus_hcode_json JSON NULL
    COMMENT 'Optional tier bonus $/hour-eq for H-code productive hours; falls back to tier_bonus_json';

CREATE TABLE IF NOT EXISTS payroll_user_compensation_level_pending (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  category TINYINT NOT NULL,
  level TINYINT NULL,
  bypass TINYINT(1) NOT NULL DEFAULT 0,
  pay_system_enabled TINYINT(1) NOT NULL DEFAULT 1,
  batch_id VARCHAR(36) NULL,
  notes VARCHAR(255) NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pending_agency_user (agency_id, user_id),
  KEY idx_pending_agency_batch (agency_id, batch_id),
  CONSTRAINT fk_pending_comp_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pending_comp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Staged pay-level changes applied only when admin runs Go with an effective start date';
