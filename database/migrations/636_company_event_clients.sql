-- Generic company event participants for non-Skill-Builders programs

CREATE TABLE IF NOT EXISTS company_event_clients (
  id INT NOT NULL AUTO_INCREMENT,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  enrolled_by_user_id INT NULL,
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_event_client (company_event_id, client_id),
  INDEX idx_company_event_clients_event (company_event_id, agency_id),
  INDEX idx_company_event_clients_client (client_id),
  CONSTRAINT fk_company_event_clients_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_event_clients_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_event_clients_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_event_clients_enrolled_by
    FOREIGN KEY (enrolled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
