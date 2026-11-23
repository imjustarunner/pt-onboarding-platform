-- Count-only billing evidence: append-only provenance, no charges or payroll rows.
CREATE TABLE IF NOT EXISTS client_session_count_imports (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 source_key CHAR(64) NOT NULL,
 source_kind VARCHAR(32) NOT NULL,
 actor_user_id INT NOT NULL,
 summary_json JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_session_count_source (agency_id,source_key),
 CONSTRAINT fk_count_import_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
 CONSTRAINT fk_count_import_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS client_session_count_evidence (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 import_id BIGINT NOT NULL,
 agency_id INT NOT NULL,
 client_id INT NOT NULL,
 provider_user_id INT NOT NULL,
 service_date DATE NOT NULL,
 service_code VARCHAR(32) NOT NULL,
 reported_sessions INT UNSIGNED NOT NULL,
 UNIQUE KEY uq_session_count_group (import_id,client_id,provider_user_id,service_date,service_code),
 KEY idx_session_count_client (agency_id,client_id,service_date),
 CONSTRAINT fk_count_evidence_import FOREIGN KEY (import_id) REFERENCES client_session_count_imports(id),
 CONSTRAINT fk_count_evidence_client FOREIGN KEY (client_id) REFERENCES clients(id),
 CONSTRAINT fk_count_evidence_provider FOREIGN KEY (provider_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
