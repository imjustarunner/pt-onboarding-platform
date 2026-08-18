-- Migration 1237: Align mixed utf8mb4_0900_* columns back to utf8mb4_unicode_ci
-- MySQL 8 defaults MODIFY COLUMN (and some ADD COLUMN) to utf8mb4_0900_ai_ci.
-- Comparing those with older utf8mb4_unicode_ci columns throws:
--   Illegal mix of collations (utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_0900_ai_ci,IMPLICIT)
-- That broke School ROI Access and parent ROI signing links.

DROP PROCEDURE IF EXISTS pthq_align_utf8mb4_unicode_ci;

CREATE PROCEDURE pthq_align_utf8mb4_unicode_ci()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE tbl VARCHAR(64);
  DECLARE cur CURSOR FOR
    SELECT t.TABLE_NAME
    FROM information_schema.TABLES t
    WHERE t.TABLE_SCHEMA = DATABASE()
      AND t.TABLE_TYPE = 'BASE TABLE'
      AND COALESCE(t.ENGINE, '') = 'InnoDB'
      AND (
        t.TABLE_COLLATION IN ('utf8mb4_0900_ai_ci', 'utf8mb4_0900_as_ci', 'utf8mb4_general_ci')
        OR EXISTS (
          SELECT 1
          FROM information_schema.COLUMNS c
          WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA
            AND c.TABLE_NAME = t.TABLE_NAME
            AND c.COLLATION_NAME IN ('utf8mb4_0900_ai_ci', 'utf8mb4_0900_as_ci', 'utf8mb4_general_ci')
        )
      );
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO tbl;
    IF done = 1 THEN
      LEAVE read_loop;
    END IF;
    SET @align_sql = CONCAT(
      'ALTER TABLE `', tbl, '` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    PREPARE align_stmt FROM @align_sql;
    EXECUTE align_stmt;
    DEALLOCATE PREPARE align_stmt;
  END LOOP;
  CLOSE cur;
END;

CALL pthq_align_utf8mb4_unicode_ci();

DROP PROCEDURE IF EXISTS pthq_align_utf8mb4_unicode_ci;

ALTER TABLE intake_links
  MODIFY COLUMN form_type
    ENUM(
      'intake',
      'public_form',
      'job_application',
      'medical_records_request',
      'smart_school_roi',
      'smart_registration',
      'internal_preferences',
      'life_balance_wheel',
      'assessment',
      'evaluation'
    )
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci
    NOT NULL
    DEFAULT 'intake';
