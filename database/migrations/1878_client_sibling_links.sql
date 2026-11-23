CREATE TABLE IF NOT EXISTS client_sibling_links (
  agency_id INT NOT NULL,
  first_client_id INT NOT NULL,
  second_client_id INT NOT NULL,
  linked_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, first_client_id, second_client_id),
  KEY idx_sibling_reverse (agency_id, second_client_id),
  CONSTRAINT fk_sibling_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_sibling_first FOREIGN KEY (first_client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_sibling_second FOREIGN KEY (second_client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB;
