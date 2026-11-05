-- Categorized PlotTwistCo price book. Does not alter existing customer contracts.
CREATE TABLE IF NOT EXISTS management_service_catalog (
  id INT PRIMARY KEY,
  catalog_json JSON NOT NULL,
  revision INT NOT NULL DEFAULT 0,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS management_service_catalog_events (
  id CHAR(36) PRIMARY KEY,
  revision INT NOT NULL,
  actor_user_id INT NOT NULL,
  catalog_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_management_catalog_revision (revision),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
