ALTER TABLE hiring_interviews
  ADD COLUMN calendar_sender_email VARCHAR(320) NULL,
  ADD COLUMN invite_error TEXT NULL;
