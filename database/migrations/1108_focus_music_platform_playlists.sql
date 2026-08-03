-- Migration 1108: Focus Music platform playlists (curated by superadmin@plottwistco.com)

CREATE TABLE focus_music_platform_playlists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_focus_music_platform_playlists_sort (sort_order, id)
);

CREATE TABLE focus_music_platform_playlist_tracks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  playlist_id INT NOT NULL,
  track_id VARCHAR(255) NOT NULL COMMENT 'Catalog track id (base64url slug)',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_platform_playlist_track (playlist_id, track_id),
  INDEX idx_platform_playlist_tracks_order (playlist_id, sort_order, id),
  CONSTRAINT fk_platform_playlist_tracks_playlist
    FOREIGN KEY (playlist_id) REFERENCES focus_music_platform_playlists(id) ON DELETE CASCADE
);
