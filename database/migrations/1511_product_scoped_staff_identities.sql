-- Existing users retain their full-suite defaults. EHR identities have separate
-- product credentials and do not enter employee onboarding/status lifecycles.
ALTER TABLE users
  ADD COLUMN identity_product VARCHAR(32) NOT NULL DEFAULT 'full_suite',
  ADD KEY idx_users_identity_product (identity_product);

-- Extend, rather than replace, the deployment's existing lifecycle enum. Test
-- projections using VARCHAR already support the value without changing type.
SET @aw_status_type = (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='status');
SET @aw_status_default = (SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='status');
SET @aw_status_nullable = (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='status');
SET @aw_status_sql = IF(@aw_status_type LIKE 'enum(%' AND LOCATE("'EHR_ONLY'", @aw_status_type)=0,
  CONCAT('ALTER TABLE users MODIFY status ', LEFT(@aw_status_type, LENGTH(@aw_status_type)-1),
    ",'EHR_ONLY')", IF(@aw_status_nullable='YES',' NULL',' NOT NULL'),
    IF(@aw_status_default IS NULL, IF(@aw_status_nullable='YES',' DEFAULT NULL',''), CONCAT(' DEFAULT ',QUOTE(@aw_status_default)))),
  'SELECT 1');
PREPARE aw_status_statement FROM @aw_status_sql;
EXECUTE aw_status_statement;
DEALLOCATE PREPARE aw_status_statement;
