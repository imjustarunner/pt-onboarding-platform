-- Migration: Add staff_step_in_after_minutes to user_preferences
-- Description: Supports "Allow support staff to step in if I don’t respond within X minutes".

ALTER TABLE user_preferences
ADD COLUMN staff_step_in_after_minutes INT NULL AFTER allow_staff_step_in;

