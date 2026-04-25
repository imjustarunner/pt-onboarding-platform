-- Migration 808: SSTC-level race division config on agencies
-- Stores enabled distances, custom emoji overrides, and lock state for each club.
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS race_division_config_json MEDIUMTEXT NULL DEFAULT NULL
    COMMENT 'JSON: { enabledKeys: string[], emojiOverrides: {key: emoji}, locked: bool }';
