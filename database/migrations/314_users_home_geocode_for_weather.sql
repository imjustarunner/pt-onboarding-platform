-- Cache user home coordinates for localized weather / snow forecast.
-- This avoids repeated geocoding calls and keeps weather lookups fast/cheap.

ALTER TABLE users
  ADD COLUMN home_lat DECIMAL(9,6) NULL,
  ADD COLUMN home_lng DECIMAL(9,6) NULL,
  ADD COLUMN home_geocoded_at DATETIME NULL;

