-- Migration 1237: Align mixed utf8mb4_0900_* columns back to utf8mb4_unicode_ci
-- MySQL 8 defaults MODIFY COLUMN (and some ADD COLUMN) to utf8mb4_0900_ai_ci.
-- Comparing those with older utf8mb4_unicode_ci columns throws:
--   Illegal mix of collations (utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_0900_ai_ci,IMPLICIT)
-- CONVERT of one table in a string FK pair fails until both sides match, so this
-- drops character-set foreign keys, converts, then restores them.
-- The restore table is committed as DDL so a failed run can resume.

CREATE TABLE IF NOT EXISTS _pthq_collation_fk_restore (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  drop_stmt TEXT NOT NULL,
  add_stmt TEXT NOT NULL,
  dropped TINYINT(1) NOT NULL DEFAULT 0,
  restored TINYINT(1) NOT NULL DEFAULT 0
);

DROP PROCEDURE IF EXISTS pthq_align_utf8mb4_unicode_ci;

CREATE PROCEDURE pthq_align_utf8mb4_unicode_ci()
BEGIN
  DECLARE v_stmt TEXT;
  DECLARE v_tbl VARCHAR(64);
  DECLARE v_id INT;
  DECLARE v_fk_count INT DEFAULT 0;

  SET SESSION group_concat_max_len = 1024000;

  SELECT COUNT(*) INTO v_fk_count FROM _pthq_collation_fk_restore;
  IF v_fk_count = 0 THEN
    INSERT INTO _pthq_collation_fk_restore (drop_stmt, add_stmt)
    SELECT
      CONCAT('ALTER TABLE `', kcu.TABLE_NAME, '` DROP FOREIGN KEY `', kcu.CONSTRAINT_NAME, '`'),
      CONCAT(
        'ALTER TABLE `', kcu.TABLE_NAME, '` ADD CONSTRAINT `', kcu.CONSTRAINT_NAME,
        '` FOREIGN KEY (`', GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR '`,`'),
        '`) REFERENCES `', kcu.REFERENCED_TABLE_NAME, '` (`',
        GROUP_CONCAT(kcu.REFERENCED_COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR '`,`'),
        '`) ON DELETE ', rc.DELETE_RULE, ' ON UPDATE ', rc.UPDATE_RULE
      )
    FROM information_schema.KEY_COLUMN_USAGE kcu
    INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
     AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     AND rc.TABLE_NAME = kcu.TABLE_NAME
    WHERE kcu.TABLE_SCHEMA = DATABASE()
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS c
        WHERE c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
          AND (
            (c.TABLE_NAME = kcu.TABLE_NAME AND c.COLUMN_NAME = kcu.COLUMN_NAME)
            OR (c.TABLE_NAME = kcu.REFERENCED_TABLE_NAME AND c.COLUMN_NAME = kcu.REFERENCED_COLUMN_NAME)
          )
          AND c.COLLATION_NAME IS NOT NULL
      )
    GROUP BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.REFERENCED_TABLE_NAME, rc.DELETE_RULE, rc.UPDATE_RULE;
  END IF;

  SET FOREIGN_KEY_CHECKS = 0;

  BEGIN
    DECLARE drop_done INT DEFAULT 0;
    DECLARE cur_drop CURSOR FOR
      SELECT id, drop_stmt FROM _pthq_collation_fk_restore WHERE dropped = 0 ORDER BY id;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET drop_done = 1;
    DECLARE CONTINUE HANDLER FOR 1091 BEGIN END;
    OPEN cur_drop;
    drop_loop: LOOP
      FETCH cur_drop INTO v_id, v_stmt;
      IF drop_done = 1 THEN
        LEAVE drop_loop;
      END IF;
      SET @align_sql = v_stmt;
      PREPARE align_stmt FROM @align_sql;
      EXECUTE align_stmt;
      DEALLOCATE PREPARE align_stmt;
      UPDATE _pthq_collation_fk_restore SET dropped = 1 WHERE id = v_id;
    END LOOP;
    CLOSE cur_drop;
  END;

  BEGIN
    DECLARE conv_done INT DEFAULT 0;
    DECLARE cur_conv CURSOR FOR
      SELECT t.TABLE_NAME
      FROM information_schema.TABLES t
      WHERE t.TABLE_SCHEMA = DATABASE()
        AND t.TABLE_TYPE = 'BASE TABLE'
        AND COALESCE(t.ENGINE, '') = 'InnoDB'
        AND t.TABLE_NAME <> '_pthq_collation_fk_restore'
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
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET conv_done = 1;
    OPEN cur_conv;
    conv_loop: LOOP
      FETCH cur_conv INTO v_tbl;
      IF conv_done = 1 THEN
        LEAVE conv_loop;
      END IF;
      SET @align_sql = CONCAT(
        'ALTER TABLE `', v_tbl, '` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
      );
      PREPARE align_stmt FROM @align_sql;
      EXECUTE align_stmt;
      DEALLOCATE PREPARE align_stmt;
    END LOOP;
    CLOSE cur_conv;
  END;

  BEGIN
    DECLARE add_done INT DEFAULT 0;
    DECLARE cur_add CURSOR FOR
      SELECT id, add_stmt FROM _pthq_collation_fk_restore WHERE restored = 0 ORDER BY id;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET add_done = 1;
    DECLARE CONTINUE HANDLER FOR 1826 BEGIN END;
    OPEN cur_add;
    add_loop: LOOP
      FETCH cur_add INTO v_id, v_stmt;
      IF add_done = 1 THEN
        LEAVE add_loop;
      END IF;
      SET @align_sql = v_stmt;
      PREPARE align_stmt FROM @align_sql;
      EXECUTE align_stmt;
      DEALLOCATE PREPARE align_stmt;
      UPDATE _pthq_collation_fk_restore SET restored = 1 WHERE id = v_id;
    END LOOP;
    CLOSE cur_add;
  END;

  SET FOREIGN_KEY_CHECKS = 1;
END;

CALL pthq_align_utf8mb4_unicode_ci();

DROP PROCEDURE IF EXISTS pthq_align_utf8mb4_unicode_ci;
DROP TABLE IF EXISTS _pthq_collation_fk_restore;

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
