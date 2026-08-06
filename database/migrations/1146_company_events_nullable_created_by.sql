-- Migration 1146: Allow NULL for created_by_user_id and updated_by_user_id on company_events
-- School portal collaborative (token-based) submissions have no logged-in user; the
-- original table was created with NOT NULL on these columns, causing 500 errors.

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE company_events
  MODIFY COLUMN created_by_user_id INT NULL DEFAULT NULL,
  MODIFY COLUMN updated_by_user_id INT NULL DEFAULT NULL;

SET FOREIGN_KEY_CHECKS = 1;
