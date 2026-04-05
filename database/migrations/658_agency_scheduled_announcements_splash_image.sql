-- Optional hero image for splash-style scheduled announcements (URL to uploaded asset).
ALTER TABLE agency_scheduled_announcements
  ADD COLUMN splash_image_url VARCHAR(512) NULL AFTER message;
