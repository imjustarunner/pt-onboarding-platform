-- Migration 1042: widen video room SID columns for Vonage session IDs
-- Legacy Twilio SIDs fit in VARCHAR(34); Vonage session IDs are longer and
-- currently fail joins with "Data too long for column 'twilio_room_sid'".
ALTER TABLE supervision_sessions
  MODIFY COLUMN twilio_room_sid VARCHAR(255) NULL;

ALTER TABLE provider_schedule_events
  MODIFY COLUMN twilio_room_sid VARCHAR(255) NULL;
