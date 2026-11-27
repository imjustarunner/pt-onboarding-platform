CREATE TABLE IF NOT EXISTS calendar_cancellation_archives (
  resource_type ENUM('appointment','provider_event','supervision','office_event') NOT NULL,
  resource_id INT UNSIGNED NOT NULL,
  agency_id INT UNSIGNED NOT NULL,
  archived_by_user_id INT UNSIGNED NOT NULL,
  archived_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (resource_type, resource_id)
) ENGINE=InnoDB;
