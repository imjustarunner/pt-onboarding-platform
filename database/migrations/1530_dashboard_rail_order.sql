ALTER TABLE user_preferences
  ADD COLUMN dashboard_rail_order_json JSON NULL
  COMMENT 'Personal My Dashboard section order; nested sections stay within their parent';
