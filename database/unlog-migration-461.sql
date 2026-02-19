-- Remove migration 461 from migrations_log so it can be run again
-- Run this with: mysql -u your_user -p your_database < database/unlog-migration-461.sql
-- Or execute the DELETE in your DB client (TablePlus, DBeaver, etc.)

DELETE FROM migrations_log 
WHERE migration_name = '461_expand_document_template_document_type_school';
