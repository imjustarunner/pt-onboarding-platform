-- Store explicit in-app RSVP explanations. Email replies are not attendance decisions.
ALTER TABLE supervision_session_attendees ADD COLUMN decline_reason VARCHAR(2000) NULL;
