-- Migration 1286: School status digest — provider, day, waitlist cleared
ALTER TABLE school_ready_schedule_digest_items
  ADD COLUMN provider_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Assigned provider display name(s) at enqueue time',
  ADD COLUMN service_day VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Assigned weekday(s) at enqueue time (e.g. Monday)',
  ADD COLUMN assignment_summary VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Human-readable provider · day pairs for the digest line',
  ADD COLUMN cleared_from_waitlist TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 when client moved from waitlist into ready_to_schedule';
