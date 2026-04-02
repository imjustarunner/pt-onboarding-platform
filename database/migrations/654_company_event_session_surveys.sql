CREATE TABLE IF NOT EXISTS company_event_session_surveys (
  id INT NOT NULL AUTO_INCREMENT,
  company_event_id INT NOT NULL,
  session_date_id INT NULL,
  survey_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_event_session_survey (company_event_id, session_date_id, survey_id),
  INDEX idx_event_session_surveys_event (company_event_id),
  INDEX idx_event_session_surveys_session (session_date_id),
  INDEX idx_event_session_surveys_survey (survey_id),
  CONSTRAINT fk_cess_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_cess_session_date
    FOREIGN KEY (session_date_id) REFERENCES company_event_session_dates(id) ON DELETE CASCADE,
  CONSTRAINT fk_cess_survey
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE survey_responses
  ADD CONSTRAINT fk_survey_responses_cess
    FOREIGN KEY (company_event_session_survey_id) REFERENCES company_event_session_surveys(id) ON DELETE SET NULL;
