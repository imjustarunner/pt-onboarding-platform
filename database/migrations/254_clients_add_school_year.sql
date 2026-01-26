-- Adds a school-year label to clients so rosters can be segmented/promoted by year.
-- Format: 'YYYY-YYYY' (e.g., '2025-2026')

ALTER TABLE clients
  ADD COLUMN school_year VARCHAR(9) NULL AFTER grade;

CREATE INDEX idx_clients_school_year ON clients(school_year);

