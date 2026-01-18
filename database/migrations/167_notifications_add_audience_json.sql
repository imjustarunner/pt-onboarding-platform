-- Migration: Add audience_json to notifications
-- Description: Allows targeted in-app visibility by role for specific notification types/triggers.

ALTER TABLE notifications
  ADD COLUMN audience_json JSON NULL AFTER message;

