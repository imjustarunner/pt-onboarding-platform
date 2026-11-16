-- Private, encrypted chart paste drafts and supplementary source records.
-- Drafts belong to the signed-in user; imported records use owner_user_id = 0.
CREATE TABLE IF NOT EXISTS client_chart_import_records (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  section_key VARCHAR(32) NOT NULL,
  owner_user_id INT NOT NULL DEFAULT 0,
  payload_enc JSON NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by_user_id INT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, client_id, section_key, owner_user_id),
  CONSTRAINT fk_chart_import_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_chart_import_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
