-- Chart service eligibility and the immutable record of the initial program retirement.
ALTER TABLE learning_program_classes ADD COLUMN registration_price_cents INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE learning_program_classes ADD COLUMN registration_audience ENUM('any','clinical','learning') NOT NULL DEFAULT 'any';
ALTER TABLE company_events ADD COLUMN registration_audience ENUM('any','clinical','learning') NOT NULL DEFAULT 'any';
CREATE TABLE IF NOT EXISTS client_program_retirement_history (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  organization_id INT NOT NULL,
  organization_name VARCHAR(255) NOT NULL,
  retired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,client_id,organization_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS client_program_retired_offerings (
  agency_id INT NOT NULL,
  kind ENUM('class','event') NOT NULL,
  offering_id INT NOT NULL,
  retired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,kind,offering_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS client_program_past_participants (
  agency_id INT NOT NULL,
  kind ENUM('class','event') NOT NULL,
  offering_id INT NOT NULL,
  client_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  audience ENUM('any','clinical','learning') NOT NULL,
  PRIMARY KEY (agency_id,kind,offering_id,client_id)
) ENGINE=InnoDB;
