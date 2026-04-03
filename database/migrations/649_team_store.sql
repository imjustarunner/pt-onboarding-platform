-- Team Store configuration per club.
-- store_config_json stores an object: { enabled, title, description, buttonText, url }

ALTER TABLE agencies
  ADD COLUMN store_config_json JSON NULL;
