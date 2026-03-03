-- Add custom_messages JSON to intake_links for per-link overrides of intro text.
-- Keys: beginSubtitle, formTimeLimit. When null/empty, defaults are used.
ALTER TABLE intake_links
  ADD COLUMN custom_messages JSON NULL AFTER retention_policy_json;
