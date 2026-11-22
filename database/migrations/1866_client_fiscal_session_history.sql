-- Verified fiscal-year totals are append-only revisions, attributed to the staff
-- member who enters them. A total replaces the period July 1 through its date.
-- later imports inside that period cannot silently inflate the verified count.
CREATE TABLE IF NOT EXISTS client_fiscal_session_history (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  fiscal_start DATE NOT NULL,
  through_date DATE NOT NULL,
  session_count INT UNSIGNED NOT NULL,
  psychotherapy_count INT UNSIGNED NULL,
  reason VARCHAR(1000) NOT NULL,
  actor_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_client_fiscal_history (agency_id,client_id,fiscal_start,id),
  CONSTRAINT fk_fiscal_history_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_fiscal_history_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_fiscal_history_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
