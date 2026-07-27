-- Migration 1058: per-provider push for Provider Year Update
ALTER TABLE provider_year_update_cycles
  ADD COLUMN pushed_at DATETIME NULL DEFAULT NULL
    COMMENT 'When this provider was pushed (My Dashboard visible)' AFTER snapshot_json,
  ADD COLUMN pushed_by_user_id INT NULL DEFAULT NULL
    COMMENT 'Admin who pushed this provider' AFTER pushed_at;

ALTER TABLE provider_year_update_cycles
  ADD CONSTRAINT fk_pyu_cycles_pushed_by
    FOREIGN KEY (pushed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
