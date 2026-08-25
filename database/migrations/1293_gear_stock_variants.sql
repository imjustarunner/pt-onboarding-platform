-- Migration 1293: Gear stock variants (color + decoration) and catalog option lists
-- Lets one catalog item (e.g. T-Shirt) hold navy/embroidered vs black/plain rows instead of many item types.

ALTER TABLE gear_catalog_items
  ADD COLUMN variant_colors_json JSON NULL
    COMMENT 'Optional color labels for this item, e.g. ["Navy","Black","White"]',
  ADD COLUMN variant_decorations_json JSON NULL
    COMMENT 'Optional decoration/finish labels, e.g. ["Embroidered","Screened","Plain"]';

ALTER TABLE gear_stock_levels
  ADD COLUMN color VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''
    COMMENT 'Color variant (empty = unspecified)',
  ADD COLUMN decoration VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''
    COMMENT 'Decoration/finish: Embroidered | Screened | Plain | etc.';

ALTER TABLE gear_stock_levels
  DROP INDEX uq_gear_stock_type_gender_size,
  ADD UNIQUE KEY uq_gear_stock_type_variant (gear_item_type_id, gender, size_label, color, decoration);

ALTER TABLE gear_assignments
  ADD COLUMN color VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''
    COMMENT 'Color variant issued',
  ADD COLUMN decoration VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''
    COMMENT 'Decoration/finish issued';

ALTER TABLE gear_stock_movements
  ADD COLUMN color VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'Color for sized stock movements',
  ADD COLUMN decoration VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'Decoration for sized stock movements';
