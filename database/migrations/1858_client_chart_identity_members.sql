CREATE TABLE IF NOT EXISTS client_chart_identity_members (
  client_id INT NOT NULL PRIMARY KEY,
  identity_id CHAR(36) CHARACTER SET ascii NOT NULL,
  INDEX idx_client_chart_identity (identity_id, client_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB;
