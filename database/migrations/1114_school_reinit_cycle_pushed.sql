-- Migration 1114: per-school push for collaborative year update
ALTER TABLE school_reinit_cycles
  ADD COLUMN pushed_at DATETIME NULL DEFAULT NULL
    COMMENT 'When this school was pushed (login splash visible)' AFTER snapshot_json,
  ADD COLUMN pushed_by_user_id INT NULL DEFAULT NULL
    COMMENT 'Admin who pushed this school' AFTER pushed_at;

ALTER TABLE school_reinit_cycles
  ADD CONSTRAINT fk_school_reinit_cycles_pushed_by
    FOREIGN KEY (pushed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
