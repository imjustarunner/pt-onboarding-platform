-- Migration 1128: track active time providers spend in Year Update
ALTER TABLE provider_year_update_cycles
  ADD COLUMN active_seconds INT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Accumulated visible time in year update UI (heartbeat accrual)',
  ADD COLUMN last_time_heartbeat_at DATETIME(3) NULL
    COMMENT 'Last session heartbeat timestamp for delta accrual';
