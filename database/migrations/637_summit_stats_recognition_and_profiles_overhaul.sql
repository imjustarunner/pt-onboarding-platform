-- Summit Stats Challenge: Recognition categories overhaul + extended participant profiles
-- Adds weight_lbs + height_inches to challenge_participant_profiles for Clydesdale/Athena
-- and height-based custom recognition categories.
-- Adds challenge_custom_field_definitions + challenge_custom_field_values for club-defined
-- recognition criteria (e.g. reach, wingspan, or any numeric/text/date member attribute).
-- NOTE: recognition_categories_json on learning_program_classes changes from a flat string
-- array to an array of rich objects — the column type stays JSON, no DDL change needed.

-- 1. Extend participant profiles with body metrics
ALTER TABLE challenge_participant_profiles
  ADD COLUMN weight_lbs DECIMAL(6,2) NULL COMMENT 'Body weight in lbs for Clydesdale/Athena eligibility' AFTER date_of_birth,
  ADD COLUMN height_inches DECIMAL(5,1) NULL COMMENT 'Height in inches for height-based recognition categories' AFTER weight_lbs;

-- 2. Club-defined custom profile field types
CREATE TABLE IF NOT EXISTS challenge_custom_field_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL COMMENT 'Club (affiliation) that owns this field',
  name VARCHAR(64) NOT NULL COMMENT 'Internal key (snake_case)',
  label VARCHAR(128) NOT NULL COMMENT 'Display label shown to members',
  field_type ENUM('number', 'text', 'date') NOT NULL DEFAULT 'number',
  unit_label VARCHAR(32) NULL COMMENT 'Display unit, e.g. lbs, cm, inches',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cfd_agency (agency_id),
  CONSTRAINT fk_cfd_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

-- 3. Member values for club-defined custom fields (per season/club/member)
CREATE TABLE IF NOT EXISTS challenge_custom_field_values (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL COMMENT 'Club',
  learning_class_id INT NULL COMMENT 'Season (NULL = applies across all seasons in club)',
  user_id INT NOT NULL,
  field_definition_id INT NOT NULL,
  value_text TEXT NULL,
  value_number DECIMAL(12,4) NULL,
  value_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_custom_value (agency_id, user_id, field_definition_id, learning_class_id),
  INDEX idx_cfv_agency_user (agency_id, user_id),
  INDEX idx_cfv_class_user (learning_class_id, user_id),
  INDEX idx_cfv_field (field_definition_id),
  CONSTRAINT fk_cfv_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_cfv_class FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cfv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cfv_field FOREIGN KEY (field_definition_id) REFERENCES challenge_custom_field_definitions(id) ON DELETE CASCADE
);
