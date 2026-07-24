-- Migration 1039: Gendered sizing for apparel gear types

ALTER TABLE gear_item_types
  ADD COLUMN is_gendered TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, size_options_json is { women: [...], men: [...] } and stock is per gender+size';

ALTER TABLE gear_stock_levels
  ADD COLUMN gender VARCHAR(16) NOT NULL DEFAULT ''
  COMMENT 'women | men | empty for unisex / legacy rows';

ALTER TABLE gear_assignments
  ADD COLUMN gender VARCHAR(16) NOT NULL DEFAULT ''
  COMMENT 'women | men | empty for unisex / legacy rows';

ALTER TABLE gear_stock_levels
  DROP INDEX uq_gear_stock_type_size,
  ADD UNIQUE KEY uq_gear_stock_type_gender_size (gear_item_type_id, gender, size_label);
