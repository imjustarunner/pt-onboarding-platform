-- Migration: Add activity_type and sub_category metadata to icons table
-- activity_type: Running, Rucking, General Fitness (open string, not enum, to allow future additions)
-- sub_category: Challenge, Award (classifies the icon's intended use for sorting/filtering)

ALTER TABLE icons
  ADD COLUMN activity_type VARCHAR(64) NULL DEFAULT NULL AFTER category,
  ADD COLUMN sub_category  VARCHAR(64) NULL DEFAULT NULL AFTER activity_type;

CREATE INDEX idx_icons_activity_type ON icons (activity_type);
CREATE INDEX idx_icons_sub_category  ON icons (sub_category);
