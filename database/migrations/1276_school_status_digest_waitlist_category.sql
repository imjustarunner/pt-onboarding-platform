-- Migration 1276: School status digests include waitlist + ready_to_schedule categories
ALTER TABLE school_ready_schedule_digest_items
  ADD COLUMN item_category VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL DEFAULT 'ready_to_schedule'
    COMMENT 'ready_to_schedule | waitlist — only these two statuses are emailed',
  ADD COLUMN waitlist_reason VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Optional waitlist reason shown in the digest Waitlist section';
