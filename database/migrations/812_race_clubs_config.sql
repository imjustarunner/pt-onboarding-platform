-- Migration 812: Race Completion Clubs config on agencies
-- Stores per-distance clubs (e.g. "Marathon Club") with tiered badge icons.
ALTER TABLE agencies
  ADD COLUMN race_clubs_config_json MEDIUMTEXT NULL DEFAULT NULL
    COMMENT 'JSON array of race club configs: [{id, label, raceDistanceMiles, tolerancePct, tiers:[{count, iconId, label}]}]';
