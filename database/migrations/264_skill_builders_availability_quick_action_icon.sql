/*
Add icon slot for "Skill Builders Availability" quick action.

Note: Use block comments because the migration runner drops `--`-prefixed statements.
*/

ALTER TABLE agencies
  ADD COLUMN skill_builders_availability_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD COLUMN skill_builders_availability_icon_id INT NULL;

