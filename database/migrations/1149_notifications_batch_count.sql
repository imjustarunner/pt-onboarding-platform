-- Migration 1149: Add batch coalescing support to notifications table
-- Allows multiple related events to be merged into one notification row
-- that updates its count and message instead of spawning a new row each time.

ALTER TABLE notifications
  ADD COLUMN batch_count INT UNSIGNED NOT NULL DEFAULT 1
    COMMENT 'How many events this notification represents (for batched/coalesced notifications)',
  ADD COLUMN batch_updated_at DATETIME NULL DEFAULT NULL
    COMMENT 'Timestamp of the last coalesce update; NULL when batch_count = 1 (original insert)';
