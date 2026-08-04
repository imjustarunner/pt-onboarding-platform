-- Migration 1129: flag when active_seconds was estimated from historical activity
ALTER TABLE provider_year_update_cycles
  ADD COLUMN active_seconds_is_inferred TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 when active_seconds was backfilled from view/section timestamps (pre-heartbeat)';
