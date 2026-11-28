ALTER TABLE session_recording_participants
  ADD COLUMN verbally_consented_at DATETIME NULL AFTER signed_at;
