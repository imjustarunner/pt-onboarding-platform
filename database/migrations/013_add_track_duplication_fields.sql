-- Migration: Add track duplication fields
-- Description: Add source_track_id and is_template to training_tracks for duplication support

ALTER TABLE training_tracks
ADD COLUMN source_track_id INT NULL AFTER role,
ADD COLUMN is_template BOOLEAN DEFAULT FALSE AFTER source_track_id,
ADD FOREIGN KEY (source_track_id) REFERENCES training_tracks(id) ON DELETE SET NULL,
ADD INDEX idx_source_track (source_track_id),
ADD INDEX idx_template (is_template);

