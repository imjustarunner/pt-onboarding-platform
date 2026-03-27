-- Migration 614: Snack and meal configuration on company_events
-- snacks_available: whether the program provides snacks (most events do)
-- snack_options_json: JSON array of specific snack strings guardians can approve
-- meals_available: whether the program provides meals (most events do NOT)
-- meal_options_json: JSON array of specific meal/food option strings

ALTER TABLE company_events
  ADD COLUMN snacks_available TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = snacks provided at this event (guardians select approved snacks in waiver)',
  ADD COLUMN snack_options_json JSON NULL DEFAULT NULL
    COMMENT 'JSON array of snack option strings offered at this event',
  ADD COLUMN meals_available TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = meals provided. 0 = guardians pack their own lunch',
  ADD COLUMN meal_options_json JSON NULL DEFAULT NULL
    COMMENT 'JSON array of meal/food option strings offered at this event';
