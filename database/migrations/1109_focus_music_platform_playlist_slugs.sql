-- Migration 1109: stable slugs for auto-synced Focus Music platform playlists

ALTER TABLE focus_music_platform_playlists
  ADD COLUMN slug VARCHAR(64) NULL DEFAULT NULL COMMENT 'Stable key for curated playlist sync' AFTER name,
  ADD UNIQUE KEY uniq_focus_music_platform_playlist_slug (slug);
