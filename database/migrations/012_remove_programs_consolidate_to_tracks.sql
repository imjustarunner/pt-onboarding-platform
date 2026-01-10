-- Migration: Remove programs, consolidate to tracks
-- Description: Remove program_id from modules and user_progress, migrate to track-based structure

-- First, ensure any modules with program_id but no track_id get assigned to a default track
-- Create default tracks for agencies that had programs (if needed)
INSERT INTO training_tracks (name, description, agency_id, is_active, order_index)
SELECT 
    CONCAT(p.name, ' Track') as name,
    p.description,
    p.agency_id,
    p.is_active,
    0 as order_index
FROM programs p
WHERE NOT EXISTS (
    SELECT 1 FROM training_tracks t 
    WHERE t.agency_id = p.agency_id 
    AND t.name = CONCAT(p.name, ' Track')
);

-- Migrate modules from programs to tracks
-- Assign modules with program_id to corresponding track
UPDATE modules m
JOIN programs p ON m.program_id = p.id
JOIN training_tracks t ON t.agency_id = p.agency_id AND t.name = CONCAT(p.name, ' Track')
SET m.track_id = t.id, m.program_id = NULL
WHERE m.program_id IS NOT NULL AND m.track_id IS NULL;

-- Also add modules to track_modules junction table if not already there
INSERT INTO track_modules (track_id, module_id, order_index)
SELECT DISTINCT m.track_id, m.id, m.order_index
FROM modules m
WHERE m.track_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM track_modules tm 
    WHERE tm.track_id = m.track_id 
    AND tm.module_id = m.id
)
ON DUPLICATE KEY UPDATE order_index = track_modules.order_index;
