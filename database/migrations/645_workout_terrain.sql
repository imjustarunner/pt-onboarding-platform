-- Add terrain field to challenge_workouts.
-- Terrain is set by the member when logging (Road, Trail, Track, Treadmill, Race, Other)
-- and can also be extracted automatically from a screenshot via Google Vision OCR.

ALTER TABLE challenge_workouts ADD COLUMN terrain VARCHAR(64) NULL;
