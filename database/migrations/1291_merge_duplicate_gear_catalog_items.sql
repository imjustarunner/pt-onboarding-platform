-- Migration 1291: Merge duplicate gear catalog items that share the same name
-- (e.g. two "Tote Bag" rows → one shared type with multiple agency enrollments)
-- Note: image merge avoids MySQL "can't specify target table for update in FROM clause"

-- Prefer the lowest catalog id as the survivor for each normalized name
UPDATE gear_item_types t
INNER JOIN gear_catalog_items lose ON lose.id = t.catalog_item_id
INNER JOIN (
  SELECT LOWER(TRIM(name)) AS nkey, MIN(id) AS keep_id
  FROM gear_catalog_items
  WHERE is_active = 1
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) > 1
) d ON LOWER(TRIM(lose.name)) = d.nkey AND lose.id <> d.keep_id
SET t.catalog_item_id = d.keep_id;

-- Move images onto the survivor via temp map (MySQL-safe)
DROP TEMPORARY TABLE IF EXISTS tmp_gear_catalog_image_moves;
CREATE TEMPORARY TABLE tmp_gear_catalog_image_moves AS
SELECT img.id AS image_id, d.keep_id
FROM gear_catalog_images img
INNER JOIN gear_catalog_items lose ON lose.id = img.catalog_item_id
INNER JOIN (
  SELECT LOWER(TRIM(name)) AS nkey, MIN(id) AS keep_id
  FROM gear_catalog_items
  WHERE is_active = 1
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) > 1
) d ON LOWER(TRIM(lose.name)) = d.nkey AND lose.id <> d.keep_id
WHERE NOT EXISTS (
  SELECT 1 FROM gear_catalog_images keep_img
  WHERE keep_img.catalog_item_id = d.keep_id
    AND keep_img.file_path = img.file_path
);

UPDATE gear_catalog_images img
INNER JOIN tmp_gear_catalog_image_moves m ON m.image_id = img.id
SET img.catalog_item_id = m.keep_id;

DROP TEMPORARY TABLE IF EXISTS tmp_gear_catalog_image_moves;

-- Re-point enrollments that don't collide
UPDATE gear_catalog_agency ca
INNER JOIN gear_catalog_items lose ON lose.id = ca.catalog_item_id
INNER JOIN (
  SELECT LOWER(TRIM(name)) AS nkey, MIN(id) AS keep_id
  FROM gear_catalog_items
  WHERE is_active = 1
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) > 1
) d ON LOWER(TRIM(lose.name)) = d.nkey AND lose.id <> d.keep_id
LEFT JOIN gear_catalog_agency keep_ca
  ON keep_ca.catalog_item_id = d.keep_id AND keep_ca.agency_id = ca.agency_id
SET ca.catalog_item_id = d.keep_id
WHERE keep_ca.id IS NULL;

-- Merge colliding enrollments into survivor, then drop loser enrollment
UPDATE gear_catalog_agency keep_ca
INNER JOIN gear_catalog_agency lose_ca
  ON lose_ca.agency_id = keep_ca.agency_id
INNER JOIN gear_catalog_items lose ON lose.id = lose_ca.catalog_item_id
INNER JOIN (
  SELECT LOWER(TRIM(name)) AS nkey, MIN(id) AS keep_id
  FROM gear_catalog_items
  WHERE is_active = 1
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) > 1
) d ON LOWER(TRIM(lose.name)) = d.nkey
  AND lose.id <> d.keep_id
  AND keep_ca.catalog_item_id = d.keep_id
SET
  keep_ca.gear_item_type_id = COALESCE(keep_ca.gear_item_type_id, lose_ca.gear_item_type_id),
  keep_ca.responsible_user_id = COALESCE(keep_ca.responsible_user_id, lose_ca.responsible_user_id),
  keep_ca.manual_is_low = GREATEST(COALESCE(keep_ca.manual_is_low, 0), COALESCE(lose_ca.manual_is_low, 0)),
  keep_ca.is_active = GREATEST(COALESCE(keep_ca.is_active, 0), COALESCE(lose_ca.is_active, 0)),
  keep_ca.low_stock_threshold = COALESCE(keep_ca.low_stock_threshold, lose_ca.low_stock_threshold);

DELETE lose_ca FROM gear_catalog_agency lose_ca
INNER JOIN gear_catalog_items lose ON lose.id = lose_ca.catalog_item_id
INNER JOIN (
  SELECT LOWER(TRIM(name)) AS nkey, MIN(id) AS keep_id
  FROM gear_catalog_items
  WHERE is_active = 1
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) > 1
) d ON LOWER(TRIM(lose.name)) = d.nkey AND lose.id <> d.keep_id;

-- Soft-deactivate duplicate catalog definitions
UPDATE gear_catalog_items lose
INNER JOIN (
  SELECT LOWER(TRIM(name)) AS nkey, MIN(id) AS keep_id
  FROM gear_catalog_items
  WHERE is_active = 1
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) > 1
) d ON LOWER(TRIM(lose.name)) = d.nkey AND lose.id <> d.keep_id
SET lose.is_active = 0;
