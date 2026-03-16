-- Summit Stats Challenge: Strava integration
-- Store Strava OAuth tokens and athlete ID for workout auto-import (future) and profile linking.
-- Tokens are encrypted at rest; access tokens expire every 6 hours and must be refreshed.

ALTER TABLE user_preferences
  ADD COLUMN strava_athlete_id BIGINT NULL COMMENT 'Strava athlete ID from OAuth' AFTER toast_preferences,
  ADD COLUMN strava_athlete_username VARCHAR(128) NULL COMMENT 'Strava username for display' AFTER strava_athlete_id,
  ADD COLUMN strava_access_token VARCHAR(256) NULL COMMENT 'Strava OAuth access token (encrypt in app)' AFTER strava_athlete_username,
  ADD COLUMN strava_refresh_token VARCHAR(256) NULL COMMENT 'Strava OAuth refresh token' AFTER strava_access_token,
  ADD COLUMN strava_token_expires_at DATETIME NULL COMMENT 'When access token expires' AFTER strava_refresh_token,
  ADD COLUMN strava_connected_at DATETIME NULL COMMENT 'When user connected Strava' AFTER strava_token_expires_at;
