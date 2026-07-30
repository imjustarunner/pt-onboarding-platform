-- Migration 1101: Marker for office wall-leftover repair follow-up.
-- Migration 1100 set office_events_wall_leftovers_repaired=1 but the bulk UPDATE can
-- abort on uniq_office_events_active_room_slot when a UTC twin already exists.
-- Run: node backend/src/scripts/repair-office-events-wall-leftovers.mjs
-- (updates free leftovers; merges/deletes colliding wall duplicates)

INSERT INTO app_timezone_migration_flags (flag_key, flag_value)
VALUES ('office_events_wall_leftovers_script_required', 1)
ON DUPLICATE KEY UPDATE flag_value = 1;
