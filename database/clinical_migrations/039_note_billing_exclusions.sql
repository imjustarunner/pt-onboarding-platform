-- Administrative annotations never replace a signed clinical record.
CREATE TABLE IF NOT EXISTS clinical_note_billing_exclusions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 clinical_note_id BIGINT NOT NULL,
 clinical_session_id BIGINT NULL,
 disposition VARCHAR(32) NOT NULL,
 reason VARCHAR(2000) NOT NULL,
 actor_user_id INT NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX ix_note_billing_exclusion(agency_id,clinical_note_id,id),
 INDEX ix_session_billing_exclusion(agency_id,clinical_session_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TRIGGER clinical_note_billing_exclusions_no_update BEFORE UPDATE ON clinical_note_billing_exclusions
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clinical billing exclusions are append-only';
CREATE TRIGGER clinical_note_billing_exclusions_no_delete BEFORE DELETE ON clinical_note_billing_exclusions
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clinical billing exclusions are append-only';
