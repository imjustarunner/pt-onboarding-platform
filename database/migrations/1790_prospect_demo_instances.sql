-- Prospect demos have an explicit lifecycle and an ownership ledger. Existing
-- operational activation flags retain their authentication meaning.
CREATE TABLE IF NOT EXISTS prospect_demo_instances (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  slug VARCHAR(80) NOT NULL,
  provider_alias VARCHAR(100) NOT NULL,
  careers_alias VARCHAR(100) NOT NULL,
  status ENUM('DEMO','LIVE') NOT NULL DEFAULT 'DEMO',
  research_json JSON NOT NULL,
  source_agency_id INT NULL,
  created_by_user_id INT NOT NULL,
  seed_version VARCHAR(40) NOT NULL,
  fixtures_cleared_at DATETIME NULL,
  activated_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_prospect_agency (agency_id),
  UNIQUE KEY uq_prospect_slug (slug),
  UNIQUE KEY uq_prospect_provider_alias (provider_alias),
  UNIQUE KEY uq_prospect_careers_alias (careers_alias),
  CONSTRAINT fk_prospect_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)
);
CREATE TABLE IF NOT EXISTS prospect_demo_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  demo_id INT NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  fixture_key VARCHAR(160) NOT NULL,
  record_kind ENUM('configuration','fixture') NOT NULL,
  source_entity_id BIGINT UNSIGNED NULL,
  metadata_json JSON NULL,
  removed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_prospect_fixture (demo_id, fixture_key),
  KEY idx_prospect_owned_record (entity_type,entity_id),
  CONSTRAINT fk_prospect_record_instance FOREIGN KEY (demo_id) REFERENCES prospect_demo_instances(id)
);
-- Append to the deployed enum rather than replacing historical lifecycle values.
SET @prospect_status_type = (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='status');
SET @prospect_status_default = (SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='status');
SET @prospect_status_nullable = (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='status');
SET @prospect_status_sql = IF(@prospect_status_type LIKE 'enum(%' AND LOCATE("'DEMO'", @prospect_status_type)=0,
  CONCAT('ALTER TABLE users MODIFY status ', LEFT(@prospect_status_type,LENGTH(@prospect_status_type)-1),
    ",'DEMO')", IF(@prospect_status_nullable='YES',' NULL',' NOT NULL'),
    IF(@prospect_status_default IS NULL,IF(@prospect_status_nullable='YES',' DEFAULT NULL',''),CONCAT(' DEFAULT ',QUOTE(@prospect_status_default)))),
  'SELECT 1');
PREPARE prospect_status_statement FROM @prospect_status_sql;
EXECUTE prospect_status_statement;
DEALLOCATE PREPARE prospect_status_statement;
