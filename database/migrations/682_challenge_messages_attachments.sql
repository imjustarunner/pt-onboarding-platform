-- Season/team chat messages now support image attachments (JSON array of file paths)
ALTER TABLE challenge_messages
  ADD COLUMN attachments_json JSON NULL DEFAULT NULL;
