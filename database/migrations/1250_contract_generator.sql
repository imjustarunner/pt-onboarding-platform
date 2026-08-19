-- Migration 1250: In-app employment contract generator (clauses / configs / templates)

CREATE TABLE IF NOT EXISTS contract_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  font_family VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  letterhead_template_id INT NULL DEFAULT NULL,
  css_extras TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_contract_templates_agency (agency_id),
  CONSTRAINT fk_contract_templates_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contract_clauses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  clause_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  body_html LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  sort_hint INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contract_clauses_agency_key (agency_id, clause_key),
  INDEX idx_contract_clauses_agency (agency_id),
  CONSTRAINT fk_contract_clauses_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contract_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  slug VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  contract_template_id INT NULL DEFAULT NULL,
  pay_mode ENUM('hourly', 'ffs', 'none') NOT NULL DEFAULT 'hourly',
  rate_config_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'e.g. licensed_masters | prelicensed | intern',
  clause_keys_json JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contract_configs_agency_slug (agency_id, slug),
  INDEX idx_contract_configs_agency (agency_id),
  CONSTRAINT fk_contract_configs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_contract_configs_template FOREIGN KEY (contract_template_id) REFERENCES contract_templates(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contract_generations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  candidate_user_id INT NOT NULL,
  config_id INT NULL DEFAULT NULL,
  template_id INT NULL DEFAULT NULL,
  token_values_json JSON NULL,
  rendered_html LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  user_specific_document_id INT NULL DEFAULT NULL,
  task_id INT NULL DEFAULT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contract_generations_agency (agency_id),
  INDEX idx_contract_generations_candidate (candidate_user_id),
  CONSTRAINT fk_contract_generations_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional JD → default config
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hiring_job_descriptions'
    AND COLUMN_NAME = 'default_contract_config_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE hiring_job_descriptions ADD COLUMN default_contract_config_id INT NULL DEFAULT NULL COMMENT ''Default contract config for this JD'', ADD COLUMN job_desc_clause_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT ''Optional JOB_DESC_* clause variant''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Seed ITSCO placeholder clauses/configs when agency exists
SET @itsco_id = (
  SELECT id FROM agencies
  WHERE organization_type = 'agency'
    AND (slug = 'itsco' OR LOWER(name) LIKE '%integrated therapy%services%' OR LOWER(name) LIKE '%itsco%')
  ORDER BY id ASC
  LIMIT 1
);

INSERT INTO contract_templates (agency_id, name, font_family, is_active)
SELECT @itsco_id, 'ITSCO Employment Letterhead', 'Georgia, serif', 1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contract_templates WHERE agency_id = @itsco_id AND name = 'ITSCO Employment Letterhead'
  );

SET @tpl_id = (
  SELECT id FROM contract_templates
  WHERE agency_id = @itsco_id AND name = 'ITSCO Employment Letterhead'
  LIMIT 1
);

INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active)
SELECT @itsco_id, 'EMPLOYMENT_PREAMBLE', 'Preamble',
  '<h2>Employment Agreement</h2><p>This Employment Agreement ("Agreement") is entered into as of <strong>{{EFFECTIVE_DATE}}</strong> by and between <strong>{{COMPANY_NAME}}</strong> ("Company"), located at {{COMPANY_ADDRESS}}, and <strong>{{EMPLOYEE_FULL_NAME}}</strong> ("Employee").</p>',
  10, 1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_clauses WHERE agency_id = @itsco_id AND clause_key = 'EMPLOYMENT_PREAMBLE');

INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active)
SELECT @itsco_id, 'JOB_DESC_GENERIC', 'Position',
  '<h3>1. Position</h3><p>Employee is employed in the position of <strong>{{JOB_TITLE}}</strong>. Service focus: {{SERVICE_FOCUS}}. {{JOB_DESCRIPTION}}</p>',
  20, 1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_clauses WHERE agency_id = @itsco_id AND clause_key = 'JOB_DESC_GENERIC');

INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active)
SELECT @itsco_id, 'COMPENSATION_HOURLY', 'Compensation (Hourly)',
  '<h3>2. Compensation</h3><p>Employee shall be paid according to the following rates. Direct rate: <strong>{{DIRECT_RATE}}</strong>. Indirect rate: <strong>{{INDIRECT_RATE}}</strong>.</p>{{INSERT_PAY_TABLE}}<p>Minimum hours (if applicable): {{MIN_HOURS}}.</p>',
  30, 1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_clauses WHERE agency_id = @itsco_id AND clause_key = 'COMPENSATION_HOURLY');

INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active)
SELECT @itsco_id, 'COMPENSATION_FFS', 'Compensation (FFS)',
  '<h3>2. Compensation</h3><p>Employee shall be compensated on a fee-for-service basis under rate configuration <strong>{{RATE_CONFIG_KEY}}</strong>.</p>{{INSERT_PAY_TABLE}}',
  30, 1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_clauses WHERE agency_id = @itsco_id AND clause_key = 'COMPENSATION_FFS');

INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active)
SELECT @itsco_id, 'SUPERVISION', 'Supervision',
  '<h3>3. Supervision</h3><p>Employee''s clinical supervisor is <strong>{{SUPERVISOR_NAME}}</strong>. License: {{LICENSE_INFO}}. University (if intern): {{UNIVERSITY}}.</p>',
  40, 1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_clauses WHERE agency_id = @itsco_id AND clause_key = 'SUPERVISION');

INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active)
SELECT @itsco_id, 'AT_WILL', 'At-Will Employment',
  '<h3>4. At-Will Employment</h3><p>Employment is at-will. Either party may end the employment relationship at any time, with or without cause or notice, subject to applicable law.</p>',
  50, 1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_clauses WHERE agency_id = @itsco_id AND clause_key = 'AT_WILL');

INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active)
SELECT @itsco_id, 'SIGNATURE_BLOCK', 'Signatures',
  '<div style="page-break-before: always;"></div><h3>Signatures</h3><p>Employee: _______________________________ Date: __________</p><p>Printed name: {{EMPLOYEE_FULL_NAME}}</p><p>Company authorized signer: _______________________________ Date: __________</p><p>For {{COMPANY_NAME}}</p>',
  90, 1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_clauses WHERE agency_id = @itsco_id AND clause_key = 'SIGNATURE_BLOCK');

INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active)
SELECT @itsco_id, 'INTERN_ADDENDUM', 'Intern Addendum',
  '<h3>Intern Addendum</h3><p>This addendum applies to internship arrangements with {{UNIVERSITY}}. Start date: {{START_DATE}}. End date: {{END_DATE}}.</p>',
  35, 1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_clauses WHERE agency_id = @itsco_id AND clause_key = 'INTERN_ADDENDUM');

INSERT INTO contract_configs (agency_id, name, slug, contract_template_id, pay_mode, rate_config_key, clause_keys_json, is_active)
SELECT @itsco_id, 'ITSCO Employment (Hourly)', 'itsco_employment_hourly', @tpl_id, 'hourly', NULL,
  JSON_ARRAY('EMPLOYMENT_PREAMBLE', 'JOB_DESC_GENERIC', 'COMPENSATION_HOURLY', 'SUPERVISION', 'AT_WILL', 'SIGNATURE_BLOCK'),
  1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_configs WHERE agency_id = @itsco_id AND slug = 'itsco_employment_hourly');

INSERT INTO contract_configs (agency_id, name, slug, contract_template_id, pay_mode, rate_config_key, clause_keys_json, is_active)
SELECT @itsco_id, 'ITSCO Employment (FFS)', 'itsco_employment_ffs', @tpl_id, 'ffs', 'licensed_masters',
  JSON_ARRAY('EMPLOYMENT_PREAMBLE', 'JOB_DESC_GENERIC', 'COMPENSATION_FFS', 'SUPERVISION', 'AT_WILL', 'SIGNATURE_BLOCK'),
  1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_configs WHERE agency_id = @itsco_id AND slug = 'itsco_employment_ffs');

INSERT INTO contract_configs (agency_id, name, slug, contract_template_id, pay_mode, rate_config_key, clause_keys_json, is_active)
SELECT @itsco_id, 'ITSCO Intern Addendum', 'itsco_intern_addendum', @tpl_id, 'none', NULL,
  JSON_ARRAY('EMPLOYMENT_PREAMBLE', 'JOB_DESC_GENERIC', 'INTERN_ADDENDUM', 'SUPERVISION', 'AT_WILL', 'SIGNATURE_BLOCK'),
  1
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contract_configs WHERE agency_id = @itsco_id AND slug = 'itsco_intern_addendum');
