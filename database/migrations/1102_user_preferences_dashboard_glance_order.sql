-- Migration 1102: persist admin dashboard At a Glance card order per user
ALTER TABLE user_preferences
  ADD COLUMN dashboard_glance_order_json JSON NULL
  COMMENT 'Per-scope At a Glance card order: keys like tenant:agency-5 or operations:platform';
