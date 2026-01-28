/*
Add provider weekly "Virtual Working Hours" template (not tied to a building/room).

Note: Use block comments because the migration runner drops `--`-prefixed statements.
*/

CREATE TABLE provider_virtual_working_hours (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  day_of_week VARCHAR(16) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_provider_virtual_hours_provider_day (agency_id, provider_id, day_of_week),
  KEY idx_provider_virtual_hours_provider (agency_id, provider_id)
);

