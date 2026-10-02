-- NULL preserves existing per-occurrence settings until the provider reviews the series.
ALTER TABLE office_standing_assignments
  ADD COLUMN bookable_in_person BOOLEAN NULL DEFAULT NULL,
  ADD COLUMN bookable_virtual BOOLEAN NULL DEFAULT NULL;
