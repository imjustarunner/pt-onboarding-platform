-- Explicit trip structure and dated assignment evidence for scoped external review.
SET @assistant_trip_sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_mileage_claims' AND COLUMN_NAME='trip_structure'),'SELECT 1','ALTER TABLE payroll_mileage_claims ADD COLUMN trip_structure VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''unknown''');
PREPARE assistant_trip_statement FROM @assistant_trip_sql;
EXECUTE assistant_trip_statement;
DEALLOCATE PREPARE assistant_trip_statement;
CREATE TABLE IF NOT EXISTS provider_school_assignment_periods (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 assignment_id INT NOT NULL,
 assignment_kind VARCHAR(24) NOT NULL DEFAULT 'school_assignment',
 provider_user_id INT NOT NULL,
 school_organization_id INT NOT NULL,
 day_of_week VARCHAR(12) NOT NULL,
 is_active TINYINT NOT NULL,
 valid_from DATETIME(3) NOT NULL,
 valid_until DATETIME(3) NULL,
 evidence_source VARCHAR(24) NOT NULL,
 KEY idx_psap_lookup(provider_user_id,school_organization_id,valid_from,valid_until),
 KEY idx_psap_assignment(assignment_kind,assignment_id,valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- The last observed update is the earliest defensible start of this snapshot.
-- Earlier dates stay unknown; current membership never fabricates past assignment.

CREATE TRIGGER IF NOT EXISTS payroll_school_assignment_insert AFTER INSERT ON provider_school_assignments FOR EACH ROW
BEGIN
 INSERT INTO provider_school_assignment_periods(assignment_id,provider_user_id,school_organization_id,day_of_week,is_active,valid_from,evidence_source)
 VALUES(NEW.id,NEW.provider_user_id,NEW.school_organization_id,NEW.day_of_week,NEW.is_active,UTC_TIMESTAMP(3),'assignment_change');
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='payroll_school_assignment_insert'
 AND EVENT_OBJECT_TABLE='provider_school_assignments' AND ACTION_TIMING='AFTER' AND EVENT_MANIPULATION='INSERT' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='1ed5575b79596cd4d1ac4854d371f78f082ebcabadd056ce4d444e45dffad69a'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='26072f14e97fae62f1fb062902c975b5705eb218cd8c77f136f05a2782d96edc'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_payroll_school_assignment_insert');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;
CREATE TRIGGER IF NOT EXISTS payroll_school_assignment_update AFTER UPDATE ON provider_school_assignments FOR EACH ROW
BEGIN
 IF NOT(OLD.provider_user_id <=> NEW.provider_user_id) OR NOT(OLD.school_organization_id <=> NEW.school_organization_id) OR NOT(OLD.day_of_week <=> NEW.day_of_week) OR NOT(OLD.is_active <=> NEW.is_active) THEN
  UPDATE provider_school_assignment_periods SET valid_until=UTC_TIMESTAMP(3) WHERE assignment_kind='school_assignment' AND assignment_id=OLD.id AND valid_until IS NULL;
  INSERT INTO provider_school_assignment_periods(assignment_id,provider_user_id,school_organization_id,day_of_week,is_active,valid_from,evidence_source)
  VALUES(NEW.id,NEW.provider_user_id,NEW.school_organization_id,NEW.day_of_week,NEW.is_active,UTC_TIMESTAMP(3),'assignment_change');
 END IF;
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='payroll_school_assignment_update'
 AND EVENT_OBJECT_TABLE='provider_school_assignments' AND ACTION_TIMING='AFTER' AND EVENT_MANIPULATION='UPDATE' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='625b5a06d50081940f5ab438d28f6428bb870ae5f9ece1d3c057fd9b130468cc'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='f1bec32ea4fa8af32119630cea5698c6b21622c18eb939e4665642abf116124b'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c'),256)='26072f14e97fae62f1fb062902c975b5705eb218cd8c77f136f05a2782d96edc'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,3,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_payroll_school_assignment_update');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;
CREATE TRIGGER IF NOT EXISTS payroll_school_assignment_delete BEFORE DELETE ON provider_school_assignments FOR EACH ROW
BEGIN
 UPDATE provider_school_assignment_periods SET valid_until=UTC_TIMESTAMP(3) WHERE assignment_kind='school_assignment' AND assignment_id=OLD.id AND valid_until IS NULL;
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='payroll_school_assignment_delete'
 AND EVENT_OBJECT_TABLE='provider_school_assignments' AND ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='DELETE' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='e868ec225d99d0ed68142b1ead750d6dd8f2c301dfd3e0043805b3df36ed572f'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='f1bec32ea4fa8af32119630cea5698c6b21622c18eb939e4665642abf116124b'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_payroll_school_assignment_delete');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;

-- School service-day assignments from the caseload route are independent evidence.
-- No client ID, client name, or chart content is copied into this history.

CREATE TRIGGER IF NOT EXISTS payroll_caseload_assignment_insert AFTER INSERT ON client_provider_assignments FOR EACH ROW
BEGIN
 INSERT INTO provider_school_assignment_periods(assignment_id,assignment_kind,provider_user_id,school_organization_id,day_of_week,is_active,valid_from,evidence_source)
 SELECT NEW.id,'caseload_assignment',NEW.provider_user_id,NEW.organization_id,COALESCE(NEW.service_day,'Unknown'),NEW.is_active,UTC_TIMESTAMP(3),'assignment_change'
 FROM agencies school WHERE school.id=NEW.organization_id AND school.organization_type='school';
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='payroll_caseload_assignment_insert'
 AND EVENT_OBJECT_TABLE='client_provider_assignments' AND ACTION_TIMING='AFTER' AND EVENT_MANIPULATION='INSERT' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='9046bb8c3b13239180c820d1f31082b7e65f4995502e7e37e0fb86a053bfa14b'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='ec23698e20aad3905b474d99316215a5576ffe06b93c08d0ab811684e44badb6'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c'),256)='35b151599e81d88b1c233d2fcf33ecd260db56f2f660728f9f0d51354fbb7c8f'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,3,'c'),256)='26072f14e97fae62f1fb062902c975b5705eb218cd8c77f136f05a2782d96edc'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,4,'c'),256)='2923297f038b376c2ffc503922ed6a5b2bbd9d1ee69dac3779ffc5162f94b099'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,5,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_payroll_caseload_assignment_insert');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;
CREATE TRIGGER IF NOT EXISTS payroll_caseload_assignment_update AFTER UPDATE ON client_provider_assignments FOR EACH ROW
BEGIN
 IF NOT(OLD.provider_user_id <=> NEW.provider_user_id) OR NOT(OLD.organization_id <=> NEW.organization_id) OR NOT(OLD.service_day <=> NEW.service_day) OR NOT(OLD.is_active <=> NEW.is_active) THEN
  UPDATE provider_school_assignment_periods SET valid_until=UTC_TIMESTAMP(3) WHERE assignment_kind='caseload_assignment' AND assignment_id=OLD.id AND valid_until IS NULL;
  INSERT INTO provider_school_assignment_periods(assignment_id,assignment_kind,provider_user_id,school_organization_id,day_of_week,is_active,valid_from,evidence_source)
  SELECT NEW.id,'caseload_assignment',NEW.provider_user_id,NEW.organization_id,COALESCE(NEW.service_day,'Unknown'),NEW.is_active,UTC_TIMESTAMP(3),'assignment_change'
  FROM agencies school WHERE school.id=NEW.organization_id AND school.organization_type='school';
 END IF;
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='payroll_caseload_assignment_update'
 AND EVENT_OBJECT_TABLE='client_provider_assignments' AND ACTION_TIMING='AFTER' AND EVENT_MANIPULATION='UPDATE' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='d2960e4ebbb50af73258e5854c757b7a56145a5d025b417e9e7f6c727e7c2437'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='ec23698e20aad3905b474d99316215a5576ffe06b93c08d0ab811684e44badb6'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c'),256)='ec23698e20aad3905b474d99316215a5576ffe06b93c08d0ab811684e44badb6'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,3,'c'),256)='35b151599e81d88b1c233d2fcf33ecd260db56f2f660728f9f0d51354fbb7c8f'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,4,'c'),256)='26072f14e97fae62f1fb062902c975b5705eb218cd8c77f136f05a2782d96edc'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,5,'c'),256)='2923297f038b376c2ffc503922ed6a5b2bbd9d1ee69dac3779ffc5162f94b099'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,6,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_payroll_caseload_assignment_update');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;
CREATE TRIGGER IF NOT EXISTS payroll_caseload_assignment_delete BEFORE DELETE ON client_provider_assignments FOR EACH ROW
BEGIN
 UPDATE provider_school_assignment_periods SET valid_until=UTC_TIMESTAMP(3) WHERE assignment_kind='caseload_assignment' AND assignment_id=OLD.id AND valid_until IS NULL;
END;
-- Keep an installed trigger continuously active. A conflicting definition must
-- be reviewed rather than silently replaced (canonical body SHA-256).
SET @assistant_trigger_matches = EXISTS(SELECT 1 FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='payroll_caseload_assignment_delete'
 AND EVENT_OBJECT_TABLE='client_provider_assignments' AND ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='DELETE' AND ACTION_ORIENTATION='ROW'
 AND SHA2(REGEXP_REPLACE(TRIM(ACTION_STATEMENT),'[[:space:]]+',' '),256)='d29a3220bc3ef2da3d0b6fbe78f03e8b3508ad3e858558045174d69ec43d78ac'
 AND SHA2(REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,1,'c'),256)='ec23698e20aad3905b474d99316215a5576ffe06b93c08d0ab811684e44badb6'
 AND REGEXP_SUBSTR(ACTION_STATEMENT,CONVERT(0x27283f3a27277c5c5c2e7c5b5e275c5c5d292a27 USING utf8mb4),1,2,'c') IS NULL);
SET @assistant_trigger_check_sql = IF(@assistant_trigger_matches,'SELECT 1','SELECT trigger_mismatch_payroll_caseload_assignment_delete');
PREPARE assistant_trigger_check FROM @assistant_trigger_check_sql;
EXECUTE assistant_trigger_check;
DEALLOCATE PREPARE assistant_trigger_check;

-- Install change tracking before seeding snapshots so concurrent edits cannot
-- leave a stale initial period. A retry never duplicates existing history.
INSERT INTO provider_school_assignment_periods(assignment_id,provider_user_id,school_organization_id,day_of_week,is_active,valid_from,evidence_source)
 SELECT id,provider_user_id,school_organization_id,day_of_week,is_active,COALESCE(updated_at,created_at,UTC_TIMESTAMP(3)),'initial_snapshot'
 FROM provider_school_assignments source_assignment WHERE NOT EXISTS (SELECT 1 FROM provider_school_assignment_periods history WHERE history.assignment_kind='school_assignment' AND history.assignment_id=source_assignment.id);
INSERT INTO provider_school_assignment_periods(assignment_id,assignment_kind,provider_user_id,school_organization_id,day_of_week,is_active,valid_from,evidence_source)
 SELECT c.id,'caseload_assignment',c.provider_user_id,c.organization_id,COALESCE(c.service_day,'Unknown'),c.is_active,COALESCE(c.updated_at,c.created_at,UTC_TIMESTAMP(3)),'initial_snapshot'
 FROM client_provider_assignments c JOIN agencies school ON school.id=c.organization_id AND school.organization_type='school' WHERE NOT EXISTS (SELECT 1 FROM provider_school_assignment_periods history WHERE history.assignment_kind='caseload_assignment' AND history.assignment_id=c.id);
