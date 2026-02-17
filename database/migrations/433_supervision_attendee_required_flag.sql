/*
Adds required/optional attendee classification for supervision session prompts.
*/

ALTER TABLE supervision_session_attendees
  ADD COLUMN is_required TINYINT(1) NOT NULL DEFAULT 1 AFTER participant_role;

CREATE INDEX idx_supervision_session_attendees_required
  ON supervision_session_attendees (session_id, is_required, user_id);
