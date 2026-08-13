-- Migration 1205: Multi-year client membership (add years without switching).
-- clients.school_year remains the active/working year label.
-- client_school_years tracks every year the client belongs on a roster.

CREATE TABLE IF NOT EXISTS client_school_years (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NULL,
  school_year VARCHAR(16) NOT NULL COMMENT 'YYYY-YYYY',
  grade VARCHAR(32) NULL COMMENT 'Grade snapshot for this school year membership',
  source VARCHAR(64) NULL COMMENT 'backfill | bulk_add | soft_schedule | create | manual',
  added_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_school_year (client_id, school_year),
  KEY idx_csy_school_year (school_year),
  KEY idx_csy_agency_year (agency_id, school_year),
  CONSTRAINT fk_csy_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill current clients.school_year into membership (does not change clients.school_year).
INSERT INTO client_school_years (client_id, agency_id, school_year, grade, source, added_by_user_id)
SELECT c.id, c.agency_id, TRIM(c.school_year), c.grade, 'backfill', NULL
FROM clients c
WHERE c.school_year IS NOT NULL
  AND TRIM(c.school_year) <> ''
ON DUPLICATE KEY UPDATE
  agency_id = COALESCE(client_school_years.agency_id, VALUES(agency_id)),
  grade = COALESCE(client_school_years.grade, VALUES(grade)),
  updated_at = CURRENT_TIMESTAMP;
