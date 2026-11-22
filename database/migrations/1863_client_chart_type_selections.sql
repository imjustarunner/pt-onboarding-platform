-- Staff selections are scoped to one chart agency. Assignments remain authoritative.
CREATE TABLE IF NOT EXISTS client_chart_type_selections (
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  selected_types JSON NOT NULL,
  revision INT UNSIGNED NOT NULL,
  PRIMARY KEY (client_id, agency_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Keep the original chart and actor IDs when an authorized deletion removes a parent row.
CREATE TABLE IF NOT EXISTS client_chart_type_history (
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  revision INT UNSIGNED NOT NULL,
  changed_by_user_id INT NOT NULL,
  previous_selection JSON NOT NULL,
  new_selection JSON NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, agency_id, revision)
) ENGINE=InnoDB;
