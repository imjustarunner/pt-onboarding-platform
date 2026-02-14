-- Migration: Add review prompt state to user_preferences
-- Description: Per-user, per-agency state for the review prompt popup.
-- Stores: dismissedUntil (ISO date), completed (boolean), snoozeUntil (ISO date).
-- Structure: { "byAgency": { "agencyId": { "dismissedUntil": "...", "completed": true } } }

ALTER TABLE user_preferences
  ADD COLUMN review_prompt_state JSON NULL COMMENT 'Per-agency review prompt state: dismissedUntil, completed, snoozeUntil';
