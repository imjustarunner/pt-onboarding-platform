-- Immutable human-facing identifiers. Existing claim_number values and payer
-- patient-control identifiers remain unchanged. Issued month is America/Denver.
-- All clinical timestamps are stored in UTC. The explicit DST calculation also
-- works in isolated MySQL installations without named timezone tables.
CREATE TABLE IF NOT EXISTS clinical_claim_reference_counters (
  agency_id INT NOT NULL,
  issue_month CHAR(7) NOT NULL,
  last_sequence BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (agency_id, issue_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_claim_references (
  clinical_claim_id BIGINT NOT NULL PRIMARY KEY,
  agency_id INT NOT NULL,
  issue_month CHAR(7) NOT NULL,
  sequence_number BIGINT UNSIGNED NOT NULL,
  public_reference VARCHAR(80) NOT NULL,
  claim_created_at DATETIME NOT NULL,
  recorded_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_claim_reference_text (public_reference),
  UNIQUE KEY uq_claim_reference_sequence (agency_id,issue_month,sequence_number),
  CONSTRAINT fk_claim_reference_claim FOREIGN KEY (clinical_claim_id) REFERENCES clinical_claims(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS allocate_clinical_claim_reference;
CREATE PROCEDURE allocate_clinical_claim_reference(IN p_claim BIGINT, IN p_agency INT, IN p_created DATETIME)
BEGIN
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_created DATETIME;
  DECLARE v_march DATETIME;
  DECLARE v_november DATETIME;
  DECLARE v_dst_start DATETIME;
  DECLARE v_dst_end DATETIME;
  DECLARE v_month CHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_next BIGINT UNSIGNED;
  SELECT COUNT(*) INTO v_exists FROM clinical_claim_references WHERE clinical_claim_id=p_claim;
  IF v_exists=0 THEN
    SET v_created=COALESCE(p_created,UTC_TIMESTAMP());
    SET v_march=STR_TO_DATE(CONCAT(YEAR(v_created),'-03-01 09:00:00'),'%Y-%m-%d %H:%i:%s');
    SET v_november=STR_TO_DATE(CONCAT(YEAR(v_created),'-11-01 08:00:00'),'%Y-%m-%d %H:%i:%s');
    SET v_dst_start=DATE_ADD(v_march,INTERVAL (MOD(8-DAYOFWEEK(v_march),7)+7) DAY);
    SET v_dst_end=DATE_ADD(v_november,INTERVAL MOD(8-DAYOFWEEK(v_november),7) DAY);
    SET v_month=DATE_FORMAT(COALESCE(CONVERT_TZ(v_created,'+00:00','America/Denver'),DATE_SUB(v_created,INTERVAL IF(v_created>=v_dst_start AND v_created<v_dst_end,6,7) HOUR)),'%Y-%m');
    INSERT INTO clinical_claim_reference_counters(agency_id,issue_month,last_sequence) VALUES(p_agency,v_month,1)
      ON DUPLICATE KEY UPDATE last_sequence=last_sequence+1;
    SELECT last_sequence INTO v_next FROM clinical_claim_reference_counters
      WHERE agency_id=p_agency AND issue_month COLLATE utf8mb4_unicode_ci=v_month COLLATE utf8mb4_unicode_ci FOR UPDATE;
    INSERT INTO clinical_claim_references(clinical_claim_id,agency_id,issue_month,sequence_number,public_reference,claim_created_at)
      VALUES(p_claim,p_agency,v_month,v_next,CONCAT(LPAD(CAST(p_agency AS CHAR),GREATEST(3,LENGTH(CAST(p_agency AS CHAR))),'0'),'-',v_month,'-',LPAD(CAST(v_next AS CHAR),GREATEST(3,LENGTH(CAST(v_next AS CHAR))),'0')),v_created);
  END IF;
END;

DROP TRIGGER IF EXISTS clinical_claim_insert_display_reference;
CREATE TRIGGER clinical_claim_insert_display_reference AFTER INSERT ON clinical_claims FOR EACH ROW
  CALL allocate_clinical_claim_reference(NEW.id,NEW.agency_id,NEW.created_at);

-- Trigger is installed before the backfill. Concurrent inserts use the same
-- locked counter; the backfill never guesses a new maximum or renumbers a row.
DROP PROCEDURE IF EXISTS backfill_clinical_claim_references;
CREATE PROCEDURE backfill_clinical_claim_references()
BEGIN
  DECLARE v_done INT DEFAULT 0;
  DECLARE v_id BIGINT;
  DECLARE v_agency INT;
  DECLARE v_created DATETIME;
  DECLARE claim_cursor CURSOR FOR SELECT c.id,c.agency_id,c.created_at FROM clinical_claims c LEFT JOIN clinical_claim_references r ON r.clinical_claim_id=c.id WHERE r.clinical_claim_id IS NULL ORDER BY c.created_at,c.id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=1;
  OPEN claim_cursor;
  reference_loop: LOOP
    FETCH claim_cursor INTO v_id,v_agency,v_created;
    IF v_done=1 THEN LEAVE reference_loop; END IF;
    CALL allocate_clinical_claim_reference(v_id,v_agency,v_created);
  END LOOP;
  CLOSE claim_cursor;
END;
CALL backfill_clinical_claim_references();
DROP PROCEDURE IF EXISTS backfill_clinical_claim_references;

DROP TRIGGER IF EXISTS clinical_claim_references_no_update;
CREATE TRIGGER clinical_claim_references_no_update BEFORE UPDATE ON clinical_claim_references FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Claim references are immutable';
DROP TRIGGER IF EXISTS clinical_claim_references_no_delete;
CREATE TRIGGER clinical_claim_references_no_delete BEFORE DELETE ON clinical_claim_references FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Claim references cannot be deleted';
