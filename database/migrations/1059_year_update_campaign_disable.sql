-- Migration 1059: Allow disabling year-update campaigns; track admin complete metadata

ALTER TABLE provider_year_update_campaigns
  MODIFY COLUMN status ENUM('draft', 'enabled', 'pushed', 'disabled') NOT NULL DEFAULT 'draft';

ALTER TABLE provider_year_update_campaigns
  ADD COLUMN disabled_at DATETIME NULL DEFAULT NULL COMMENT 'When campaign was disabled for the school year' AFTER pushed_by_user_id,
  ADD COLUMN disabled_by_user_id INT NULL DEFAULT NULL AFTER disabled_at;

ALTER TABLE provider_year_update_campaigns
  ADD CONSTRAINT fk_pyu_campaign_disabled_by
    FOREIGN KEY (disabled_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE school_reinit_campaigns
  MODIFY COLUMN status ENUM('draft', 'enabled', 'pushed', 'disabled') NOT NULL DEFAULT 'draft';

ALTER TABLE school_reinit_campaigns
  ADD COLUMN disabled_at DATETIME NULL DEFAULT NULL COMMENT 'When campaign was disabled for the school year' AFTER pushed_by_user_id,
  ADD COLUMN disabled_by_user_id INT NULL DEFAULT NULL AFTER disabled_at;

ALTER TABLE school_reinit_campaigns
  ADD CONSTRAINT fk_school_reinit_campaign_disabled_by
    FOREIGN KEY (disabled_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE provider_year_update_cycles
  ADD COLUMN admin_completed_at DATETIME NULL DEFAULT NULL COMMENT 'Admin marked complete / unpushed' AFTER finalized_at,
  ADD COLUMN admin_completed_by_user_id INT NULL DEFAULT NULL AFTER admin_completed_at;

ALTER TABLE provider_year_update_cycles
  ADD CONSTRAINT fk_pyu_cycle_admin_completed_by
    FOREIGN KEY (admin_completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
