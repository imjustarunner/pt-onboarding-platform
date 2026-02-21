-- Migration: Add sms_access_enabled to twilio_number_assignments
-- Description: Enables multi-recipient SMS — multiple users can be eligible to receive inbound messages for one number.
-- Each assignment can independently toggle SMS access (On/Off) while sharing the number.

ALTER TABLE twilio_number_assignments
  ADD COLUMN sms_access_enabled BOOLEAN DEFAULT TRUE AFTER is_primary;
