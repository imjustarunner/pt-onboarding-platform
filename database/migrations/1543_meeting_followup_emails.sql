-- Track delivery separately from AI generation. No summary or transcript copies here.
ALTER TABLE meeting_summary_jobs ADD COLUMN followup_checked_at DATETIME NULL;
-- Do not unexpectedly email historical meetings when this feature is deployed.
UPDATE meeting_summary_jobs SET followup_checked_at=UTC_TIMESTAMP();
CREATE TABLE meeting_followup_deliveries (
  meeting_type ENUM('team','supervision') NOT NULL,
  meeting_id INT NOT NULL,
  user_id INT NOT NULL,
  delivery_status ENUM('sending','sent','held','approval','review') NOT NULL,
  communication_id INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(meeting_type,meeting_id,user_id)
);
