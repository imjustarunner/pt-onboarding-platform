-- Migration 1170: tenant regulatory board overrides for Smart Disclosure
ALTER TABLE agency_disclosure_settings
  ADD COLUMN regulatory_boards_json JSON NULL
  COMMENT 'Per-license-type regulatory board overrides (merged with CO defaults in app)';
