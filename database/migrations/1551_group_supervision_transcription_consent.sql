-- Follows main's migrations through 1550; safe if the consent table already exists.
CREATE TABLE IF NOT EXISTS supervision_group_transcription_consents (
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  notice_version VARCHAR(40) NOT NULL,
  accepted_at DATETIME NOT NULL,
  PRIMARY KEY (session_id, user_id, notice_version)
);
