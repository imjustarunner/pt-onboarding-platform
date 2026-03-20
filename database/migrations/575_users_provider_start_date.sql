-- Employment / tenure start date for providers (admin-managed; used for anniversaries and dashboards).
ALTER TABLE users
  ADD COLUMN provider_start_date DATE NULL DEFAULT NULL;
