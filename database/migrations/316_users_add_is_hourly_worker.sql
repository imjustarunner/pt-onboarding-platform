-- Migration: Add is_hourly_worker to users
-- Description: Boolean for "Hourly Workers" – drives Direct/Indirect ratio card visibility and notifications.

ALTER TABLE users
ADD COLUMN is_hourly_worker TINYINT(1) NOT NULL DEFAULT 0 AFTER skill_builder_eligible;

CREATE INDEX idx_users_is_hourly_worker ON users(is_hourly_worker);
