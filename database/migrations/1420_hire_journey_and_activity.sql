-- Separate lifecycle receipts and server-timed onboarding work. No historical time is inferred.
CREATE TABLE IF NOT EXISTS hire_journeys (
  user_id INT PRIMARY KEY,
  agency_id INT NOT NULL,
  prehire_completed_at DATETIME NULL,
  onboarding_started_at DATETIME NULL,
  onboarding_completed_at DATETIME NULL,
  prehire_snapshot JSON NULL,
  onboarding_snapshot JSON NULL,
  activity_session VARCHAR(80) NULL,
  activity_sequence BIGINT NOT NULL DEFAULT 0,
  activity_seen_at DATETIME(3) NULL,
  activity_active BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hire_onboarding_time (
  user_id INT NOT NULL,
  work_date DATE NOT NULL COMMENT 'UTC activity date',
  seconds DECIMAL(12,3) NOT NULL DEFAULT 0,
  payroll_claim_id INT NULL,
  PRIMARY KEY (user_id, work_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_claim_id) REFERENCES payroll_time_claims(id) ON DELETE RESTRICT
);

-- Explicit package provenance is more reliable than current employee status.
UPDATE tasks t
JOIN onboarding_packages p ON p.id = JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.fromPackage'))
SET t.metadata = JSON_SET(COALESCE(t.metadata, JSON_OBJECT()), '$.portalPhase',
  IF(p.package_type = 'pre_hire', 'pre_hire', 'onboarding'))
WHERE JSON_EXTRACT(t.metadata, '$.portalPhase') IS NULL
  AND p.package_type IN ('pre_hire', 'onboarding');

UPDATE tasks SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.portalPhase', 'pre_hire')
WHERE JSON_EXTRACT(metadata, '$.contractGeneration') = TRUE
  AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.source')), '') != 'provider_update';

-- The existing form-assignment and review-notification paths use these values,
-- but the last enum migration omitted them. Preserve every existing enum member.
SET @task_type_definition = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'task_type');
SET @task_type_definition = IF(LOCATE('''intake_form''', @task_type_definition) = 0,
  CONCAT(LEFT(@task_type_definition, LENGTH(@task_type_definition) - 1), ',''intake_form'')'), @task_type_definition);
SET @task_type_definition = IF(LOCATE('''notification''', @task_type_definition) = 0,
  CONCAT(LEFT(@task_type_definition, LENGTH(@task_type_definition) - 1), ',''notification'')'), @task_type_definition);
SET @hire_task_sql = CONCAT('ALTER TABLE tasks MODIFY COLUMN task_type ', @task_type_definition, ' NOT NULL');
PREPARE hire_task_stmt FROM @hire_task_sql;
EXECUTE hire_task_stmt;
DEALLOCATE PREPARE hire_task_stmt;

-- Portal links grant scoped hire access and must never become staff-login tokens.
ALTER TABLE users MODIFY COLUMN passwordless_token_purpose ENUM('setup', 'reset', 'prehire_portal') NULL DEFAULT 'setup';
UPDATE users u JOIN hiring_profiles hp ON hp.candidate_user_id = u.id
SET u.passwordless_token_purpose = 'prehire_portal'
WHERE u.status IN ('PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING')
  AND u.passwordless_token IS NOT NULL
  AND COALESCE(u.passwordless_token_purpose, 'setup') != 'reset';
