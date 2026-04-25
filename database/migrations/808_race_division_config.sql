-- Migration 808: SSTC-level race division config on agencies
ALTER TABLE agencies
  ADD COLUMN race_division_config_json MEDIUMTEXT NULL DEFAULT NULL
    COMMENT 'JSON: { enabledKeys: string[], emojiOverrides: {key: emoji}, locked: bool }';
