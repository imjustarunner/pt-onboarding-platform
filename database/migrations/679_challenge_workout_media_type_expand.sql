-- Expand challenge_workout_media.media_type enum to support treadmill proof and map images.
-- 'image'          : workout screenshot used for Vision OCR and as main proof
-- 'treadmill_proof': separate treadmill-display photo required for treadmill entries
-- 'map'            : optional route map image (when Strava map is unavailable or for manual entries)
-- 'gif'            : animated GIF (existing)

ALTER TABLE challenge_workout_media
  MODIFY COLUMN media_type ENUM('image','gif','treadmill_proof','map') NOT NULL DEFAULT 'image';
