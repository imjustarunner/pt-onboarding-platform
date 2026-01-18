-- Agency-level feature toggles (pricing / rollout controls)
-- Stored as JSON for extensibility.

ALTER TABLE agencies
  ADD COLUMN feature_flags JSON NULL;

