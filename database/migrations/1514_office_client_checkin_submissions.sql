-- Private client arrivals and immutable questionnaire snapshots. No public client lookup.
CREATE TABLE IF NOT EXISTS office_client_checkin_submissions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  office_location_id INT NOT NULL,
  event_id INT NOT NULL,
  provider_id INT NOT NULL,
  agency_id INT NOT NULL,
  scheduled_start_at DATETIME NOT NULL,
  scheduled_end_at DATETIME NOT NULL,
  client_id INT NULL,
  clinical_session_id BIGINT NULL,
  forms_json JSON NOT NULL,
  answers_json JSON NULL,
  forms_unavailable BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  attachment_history_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_office_checkin_token (token_hash),
  KEY idx_office_checkin_provider_date (provider_id, scheduled_start_at),
  KEY idx_office_checkin_client (client_id),
  KEY idx_office_checkin_session (clinical_session_id),
  CONSTRAINT fk_office_client_checkin_event FOREIGN KEY (event_id) REFERENCES office_events(id),
  CONSTRAINT fk_office_client_checkin_provider FOREIGN KEY (provider_id) REFERENCES users(id),
  CONSTRAINT fk_office_client_checkin_client FOREIGN KEY (client_id) REFERENCES clients(id)
);

SET @add_respondent_type = IF(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'office_slot_questionnaire_rules' AND column_name = 'respondent_type'),
  'SELECT 1',
  'ALTER TABLE office_slot_questionnaire_rules ADD COLUMN respondent_type ENUM(''adult_self'',''youth_self'',''caregiver'') NOT NULL DEFAULT ''adult_self'''
);
PREPARE add_respondent_type FROM @add_respondent_type;
EXECUTE add_respondent_type;
DEALLOCATE PREPARE add_respondent_type;
