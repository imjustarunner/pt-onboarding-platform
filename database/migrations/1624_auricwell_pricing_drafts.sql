-- Pricing review only: no subscription activation, invoice generation or legacy price change.
CREATE TABLE IF NOT EXISTS auricwell_pricing_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  revision INT UNSIGNED NOT NULL,
  pricing_version VARCHAR(40) NOT NULL,
  input_json JSON NOT NULL,
  quote_json JSON NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auricwell_pricing_revision (agency_id, revision)
) ENGINE=InnoDB;
