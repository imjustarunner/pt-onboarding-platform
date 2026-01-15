-- Migration: Add emergency_override to user_preferences
-- Description: Allow users to bypass Quiet Hours for urgent/emergency delivery rules.

ALTER TABLE user_preferences
ADD COLUMN emergency_override BOOLEAN DEFAULT FALSE AFTER auto_reply_message;

