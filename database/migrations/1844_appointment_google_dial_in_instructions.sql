ALTER TABLE appointments ADD COLUMN include_google_dial_in TINYINT(1) NOT NULL DEFAULT 0 AFTER external_meeting_url;
