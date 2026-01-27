-- Migration: Add tutorial_progress to user_preferences
-- Description: Persist per-user product-tour/tutorial progress (frontend Driver.js tours)

ALTER TABLE user_preferences
  ADD COLUMN tutorial_progress JSON NULL
  AFTER default_landing_page;

