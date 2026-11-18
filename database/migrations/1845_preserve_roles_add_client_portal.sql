-- Client-owned portal accounts are distinct from guardian and staff identities.
-- Append the role without replacing deployed roles, defaults or collation.
SET @client_portal_roles = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @client_portal_default = (SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @client_portal_nullable = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @client_portal_charset = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @client_portal_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @client_portal_sql = IF(LOCATE('''client''',@client_portal_roles)>0,'SELECT 1',CONCAT('ALTER TABLE users MODIFY COLUMN role ',LEFT(@client_portal_roles,LENGTH(@client_portal_roles)-1),',''client'') CHARACTER SET ',@client_portal_charset,' COLLATE ',@client_portal_collation,' ',IF(@client_portal_nullable='YES','NULL','NOT NULL'),IF(@client_portal_default IS NULL,'',CONCAT(' DEFAULT ',QUOTE(@client_portal_default)))));
PREPARE client_portal_statement FROM @client_portal_sql;
EXECUTE client_portal_statement;
DEALLOCATE PREPARE client_portal_statement;
