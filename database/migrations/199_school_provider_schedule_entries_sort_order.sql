-- Migration: Add sort_order to school provider schedule entries
-- Description: Supports soft ordering (move up/down) within provider/day.

ALTER TABLE school_provider_schedule_entries
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER client_id,
  ADD INDEX idx_sps_sort (school_organization_id, provider_user_id, day_of_week, sort_order);

