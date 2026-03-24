-- Public catalog: optional age range (null = any age).

ALTER TABLE company_events
  ADD COLUMN public_age_min TINYINT UNSIGNED NULL DEFAULT NULL COMMENT 'Minimum participant age for public listing (NULL = no lower bound)',
  ADD COLUMN public_age_max TINYINT UNSIGNED NULL DEFAULT NULL COMMENT 'Maximum participant age for public listing (NULL = no upper bound)';
