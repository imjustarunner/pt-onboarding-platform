-- Migration: Cache Google Distance Matrix results
-- Description: Avoid repeated external API calls for the same origin/destination.

CREATE TABLE IF NOT EXISTS google_distance_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  origin_hash CHAR(64) NOT NULL,
  destination_hash CHAR(64) NOT NULL,
  origin_text VARCHAR(512) NOT NULL,
  destination_text VARCHAR(512) NOT NULL,
  mode VARCHAR(32) NOT NULL DEFAULT 'driving',
  distance_meters INT NULL,
  duration_seconds INT NULL,
  status VARCHAR(32) NULL,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_origin_dest_mode (origin_hash, destination_hash, mode),
  INDEX idx_fetched_at (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

