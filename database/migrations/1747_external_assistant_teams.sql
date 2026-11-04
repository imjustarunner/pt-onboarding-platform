-- Preserve the deployed role enumeration, including roles not present in old snapshots.
SET @assistant_current_roles = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @assistant_role_default = (SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @assistant_role_nullable = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @assistant_role_charset = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @assistant_role_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @assistant_role_sql = IF(LOCATE('''assistant''',@assistant_current_roles)>0,'SELECT 1',CONCAT('ALTER TABLE users MODIFY COLUMN role ',LEFT(@assistant_current_roles,LENGTH(@assistant_current_roles)-1),',''assistant'') CHARACTER SET ',@assistant_role_charset,' COLLATE ',@assistant_role_collation,' ',IF(@assistant_role_nullable='YES','NULL','NOT NULL'),IF(@assistant_role_default IS NULL,'',CONCAT(' DEFAULT ',QUOTE(@assistant_role_default)))));
PREPARE assistant_role_statement FROM @assistant_role_sql;
EXECUTE assistant_role_statement;
DEALLOCATE PREPARE assistant_role_statement;
SET @assistant_marker_sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='is_assistant_account'),'SELECT 1','ALTER TABLE users ADD COLUMN is_assistant_account TINYINT(1) NOT NULL DEFAULT 0');
PREPARE assistant_marker_statement FROM @assistant_marker_sql;
EXECUTE assistant_marker_statement;
DEALLOCATE PREPARE assistant_marker_statement;

CREATE TABLE IF NOT EXISTS assistant_accounts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 agency_id INT NOT NULL,
 subrole VARCHAR(40) NOT NULL,
 status ENUM('pending','active','paused','disabled') NOT NULL DEFAULT 'pending',
 policy_revision INT UNSIGNED NOT NULL DEFAULT 1,
 capabilities_json JSON NOT NULL,
 schedule_json JSON NOT NULL,
 baa_status ENUM('pending','verified') NOT NULL DEFAULT 'pending',
 privacy_policy_json JSON NOT NULL,
 group_status ENUM('pending','ready','failed','drift') NOT NULL DEFAULT 'pending',
 group_snapshot_json JSON NULL,
 credential_set_at DATETIME(3) NULL,
 credential_fingerprint CHAR(64) NULL,
 configuration_fingerprint CHAR(64) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_assistant_user(user_id),
 UNIQUE KEY uq_assistant_agency_subrole(agency_id,subrole),
 CONSTRAINT fk_assistant_user FOREIGN KEY(user_id) REFERENCES users(id),
 CONSTRAINT fk_assistant_agency FOREIGN KEY(agency_id) REFERENCES agencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assistant_work_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ref CHAR(36) NOT NULL,
 account_id BIGINT UNSIGNED NOT NULL,
 agency_id INT NOT NULL,
 task_kind VARCHAR(60) NOT NULL,
 title VARCHAR(180) NOT NULL,
 source_kind VARCHAR(40) NOT NULL,
 source_id INT NULL,
 source_hash CHAR(64) NOT NULL,
 packet_ciphertext LONGTEXT NOT NULL,
 mapping_ciphertext LONGTEXT NOT NULL,
 state ENUM('queued','leased','completed','blocked','stale') NOT NULL DEFAULT 'queued',
 due_at DATETIME(3) NOT NULL,
 slot_key VARCHAR(160) NULL,
 priority SMALLINT NOT NULL DEFAULT 0,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_assistant_work_ref(ref),
 UNIQUE KEY uq_assistant_work_source(account_id,task_kind,source_hash),
 KEY idx_assistant_work_due(account_id,state,due_at),
 CONSTRAINT fk_assistant_work_account FOREIGN KEY(account_id) REFERENCES assistant_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assistant_runs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ref CHAR(36) NOT NULL,
 work_id BIGINT UNSIGNED NOT NULL,
 account_id BIGINT UNSIGNED NOT NULL,
 agency_id INT NOT NULL,
 source_hash CHAR(64) NOT NULL,
 lease_expires_at DATETIME(3) NOT NULL,
 heartbeat_at DATETIME(3) NOT NULL,
 completed_at DATETIME(3) NULL,
 outcome ENUM('PASS','FAIL','BLOCKED','NOT_RUN') NULL,
 evidence_ciphertext LONGTEXT NULL,
 started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_assistant_run_ref(ref),
 KEY idx_assistant_run_lease(account_id,completed_at,lease_expires_at),
 CONSTRAINT fk_assistant_run_work FOREIGN KEY(work_id) REFERENCES assistant_work_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assistant_proposals (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ref CHAR(36) NOT NULL,
 work_id BIGINT UNSIGNED NOT NULL,
 run_id BIGINT UNSIGNED NOT NULL,
 account_id BIGINT UNSIGNED NOT NULL,
 agency_id INT NOT NULL,
 source_hash CHAR(64) NOT NULL,
 payload_ciphertext LONGTEXT NOT NULL,
 decision ENUM('pending','accepted','dismissed','more_information','stale') NOT NULL DEFAULT 'pending',
 reviewed_by_user_id INT NULL,
 review_reason VARCHAR(1000) NULL,
 reviewed_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_assistant_proposal_ref(ref),
 UNIQUE KEY uq_assistant_proposal_run(run_id),
 KEY idx_assistant_proposal_review(agency_id,decision),
 CONSTRAINT fk_assistant_proposal_run FOREIGN KEY(run_id) REFERENCES assistant_runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assistant_change_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 event_key CHAR(36) NOT NULL,
 account_id BIGINT UNSIGNED NOT NULL,
 agency_id INT NOT NULL,
 actor_user_id INT NULL,
 event_type VARCHAR(60) NOT NULL,
 changes_json JSON NOT NULL,
 reason VARCHAR(1000) NOT NULL,
 email_status ENUM('pending','sent') NOT NULL DEFAULT 'pending',
 notification_at DATETIME(3) NULL,
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 last_error VARCHAR(120) NULL,
 sent_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_assistant_change_event(event_key),
 KEY idx_assistant_change_delivery(email_status,next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assistant_verifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 account_id BIGINT UNSIGNED NOT NULL,
 capability VARCHAR(80) NOT NULL,
 policy_version VARCHAR(60) NOT NULL,
 configuration_hash CHAR(64) NOT NULL,
 outcome ENUM('PASS','FAIL','BLOCKED','NOT_RUN') NOT NULL,
 build_id VARCHAR(100) NOT NULL,
 evidence_ref VARCHAR(500) NOT NULL,
 verified_by_user_id INT NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_assistant_verification(account_id,capability,policy_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assistant_source_changes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 client_id INT NOT NULL,
 source_kind VARCHAR(50) NOT NULL,
 source_id INT NOT NULL,
 changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 processed_at DATETIME(3) NULL,
 UNIQUE KEY uq_assistant_source_change(agency_id,source_kind,source_id),
 KEY idx_assistant_source_changes(agency_id,processed_at,changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assistant_marketing_revisions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ref CHAR(36) NOT NULL,
 agency_id INT NOT NULL,
 page_id INT NOT NULL,
 account_id BIGINT UNSIGNED NOT NULL,
 variant_key VARCHAR(80) NOT NULL,
 source_hash CHAR(64) NOT NULL,
 before_json JSON NOT NULL,
 after_json JSON NOT NULL,
 rolled_back_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_assistant_marketing_ref(ref),
 UNIQUE KEY uq_assistant_marketing_variant(account_id,page_id,variant_key,source_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assistant_preparation_jobs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ref CHAR(36) NOT NULL,
 account_id BIGINT UNSIGNED NOT NULL,
 agency_id INT NOT NULL,
 slot_key VARCHAR(160) NOT NULL,
 state ENUM('queued','running','completed','blocked') NOT NULL DEFAULT 'queued',
 source_cursor INT NOT NULL DEFAULT 0,
 lease_expires_at DATETIME(3) NULL,
 queued_items INT NOT NULL DEFAULT 0,
 skipped_items INT NOT NULL DEFAULT 0,
 blocked_items INT NOT NULL DEFAULT 0,
 last_reason_code VARCHAR(100) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_assistant_preparation_ref(ref),
 UNIQUE KEY uq_assistant_preparation_slot(account_id,slot_key),
 KEY idx_assistant_preparation_work(state,lease_expires_at),
 CONSTRAINT fk_assistant_preparation_account FOREIGN KEY(account_id) REFERENCES assistant_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER IF NOT EXISTS assistant_account_scope_insert BEFORE INSERT ON assistant_accounts FOR EACH ROW
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='assistant' AND is_assistant_account=1) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Assistant machine identity required';
 END IF;
 IF EXISTS(SELECT 1 FROM user_agencies WHERE user_id=NEW.user_id AND agency_id<>NEW.agency_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Assistant must have exactly one agency';
 END IF;
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='assistant_account_scope_insert'
 AND EVENT_OBJECT_TABLE='assistant_accounts' AND ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='INSERT' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='ddfbca4376425521e94bbedc824baca32079fcae3600f1e02a20a07f036cd5e9'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='539e330cedfafd707dd3bec6ba699fb98bac582922c2d371e495ba7a6c779d5c'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c'),256)='34e2353dacbfd273824612b4aabbaefc25adddb3117bd04682cc886505e273c4'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,3,'c'),256)='b578ed9f60704ff267653507795e76a699185422caf88128d0243b03f741ce02'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,4,'c'),256)='34e2353dacbfd273824612b4aabbaefc25adddb3117bd04682cc886505e273c4'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,5,'c'),256)='b9837b712835f02d6f9cfa747b3f7af3d893f5bf3113a14133b46b6a3fb2201e'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,6,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_assistant_account_scope_insert');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;
CREATE TRIGGER IF NOT EXISTS assistant_account_scope_update BEFORE UPDATE ON assistant_accounts FOR EACH ROW
BEGIN
 IF NEW.user_id<>OLD.user_id OR NEW.agency_id<>OLD.agency_id OR NEW.subrole<>OLD.subrole THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Assistant identity, agency and subrole are immutable';
 END IF;
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='assistant_account_scope_update'
 AND EVENT_OBJECT_TABLE='assistant_accounts' AND ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='UPDATE' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='1519628d465fe07c55599f0fd9acb164a8c933959dafdba56f0d51a749ae9a29'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='34e2353dacbfd273824612b4aabbaefc25adddb3117bd04682cc886505e273c4'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c'),256)='4ece80953e5682125b43d3e2d2c2d6a2a64eaa408566facaa483404dace8edd6'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,3,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_assistant_account_scope_update');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;
CREATE TRIGGER IF NOT EXISTS assistant_identity_immutable BEFORE UPDATE ON users FOR EACH ROW
BEGIN
 IF OLD.is_assistant_account=1 AND (NEW.is_assistant_account<>1 OR NEW.role<>'assistant') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Assistant identity cannot become a human account';
 END IF;
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='assistant_identity_immutable'
 AND EVENT_OBJECT_TABLE='users' AND ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='UPDATE' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='5b5cb230b80623d16e2e8fce49bf6a24df58bedf8188a05e2eabc0f3d1151e71'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='539e330cedfafd707dd3bec6ba699fb98bac582922c2d371e495ba7a6c779d5c'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c'),256)='34e2353dacbfd273824612b4aabbaefc25adddb3117bd04682cc886505e273c4'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,3,'c'),256)='f3e0fd1b645b706f211b039bb4f82061c3e2d0b23af4a61065649d9796202db0'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,4,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_assistant_identity_immutable');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;
CREATE TRIGGER IF NOT EXISTS assistant_membership_insert BEFORE INSERT ON user_agencies FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM assistant_accounts WHERE user_id=NEW.user_id AND agency_id<>NEW.agency_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Assistant belongs to one agency';
 END IF;
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='assistant_membership_insert'
 AND EVENT_OBJECT_TABLE='user_agencies' AND ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='INSERT' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='9062eef3a3e7d34ea0360218d10ef3c8bb795c6215e0340af2021c53b056df8a'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='34e2353dacbfd273824612b4aabbaefc25adddb3117bd04682cc886505e273c4'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c'),256)='62b4fded4f4c0f81a48c8e11c0bd682af8fca681b724ec6c140d5180d9ae5941'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,3,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_assistant_membership_insert');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;
CREATE TRIGGER IF NOT EXISTS assistant_membership_update BEFORE UPDATE ON user_agencies FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM assistant_accounts WHERE user_id=NEW.user_id AND agency_id<>NEW.agency_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Assistant belongs to one agency';
 END IF;
 IF EXISTS(SELECT 1 FROM assistant_accounts WHERE user_id=OLD.user_id) AND (NEW.user_id<>OLD.user_id OR NEW.agency_id<>OLD.agency_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Assistant membership cannot be reassigned';
 END IF;
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='assistant_membership_update'
 AND EVENT_OBJECT_TABLE='user_agencies' AND ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='UPDATE' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='b1346c0294a330528e0905a13561700139f3087c3887ea6a4824bdd3bb303cfa'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='34e2353dacbfd273824612b4aabbaefc25adddb3117bd04682cc886505e273c4'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c'),256)='62b4fded4f4c0f81a48c8e11c0bd682af8fca681b724ec6c140d5180d9ae5941'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,3,'c'),256)='34e2353dacbfd273824612b4aabbaefc25adddb3117bd04682cc886505e273c4'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,4,'c'),256)='733a8f6da079bf5e0cfc1565e1a16daa1972baa7eaaff660a04d8c43b58f6e9b'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,5,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_assistant_membership_update');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;
CREATE TRIGGER IF NOT EXISTS assistant_membership_delete BEFORE DELETE ON user_agencies FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM assistant_accounts WHERE user_id=OLD.user_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Disable assistants through Assistant Teams';
 END IF;
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='assistant_membership_delete'
 AND EVENT_OBJECT_TABLE='user_agencies' AND ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='DELETE' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='2501b7416d4346137e1fb90385219f0b9b88ae645a07de3b97c2ca368627ca49'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='34e2353dacbfd273824612b4aabbaefc25adddb3117bd04682cc886505e273c4'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c'),256)='d74320a9d0cc046e375a4f2cdd7875ac5cd6d2294f7a6490185e9f04d16fcde0'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,3,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_assistant_membership_delete');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;
