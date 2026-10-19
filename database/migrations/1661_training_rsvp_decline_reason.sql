-- Keep the reason with each participant's RSVP for the remaining training dates.
ALTER TABLE meeting_participant_preferences
  ADD COLUMN rsvp_decline_reason VARCHAR(2000) NULL AFTER rsvp_at;
