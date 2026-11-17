-- Worksite selection is separate from reserving an office room. Retain the
-- original location_name snapshot for existing recorded work.
ALTER TABLE childcare_shifts
  ADD COLUMN office_location_id INT NULL,
  ADD COLUMN room_id INT NULL;
