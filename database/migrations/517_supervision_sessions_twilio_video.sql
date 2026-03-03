-- Add Twilio Video room support for supervision sessions.
-- When set, the session uses Twilio Video instead of Google Meet for accurate attendance tracking.

ALTER TABLE supervision_sessions
  ADD COLUMN twilio_room_sid VARCHAR(34) NULL AFTER google_meet_link,
  ADD COLUMN twilio_room_unique_name VARCHAR(255) NULL AFTER twilio_room_sid;

CREATE INDEX idx_supervision_sessions_twilio_room
  ON supervision_sessions (twilio_room_sid);
