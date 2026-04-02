CREATE TABLE IF NOT EXISTS survey_responses (
  id INT NOT NULL AUTO_INCREMENT,
  survey_id INT NOT NULL,
  survey_push_id INT NULL,
  respondent_user_id INT NULL,
  client_id INT NULL,
  company_event_session_survey_id INT NULL,
  response_data_json JSON NULL,
  total_score DECIMAL(8,2) NULL,
  category_scores_json JSON NULL,
  submitted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_survey_responses_survey (survey_id),
  INDEX idx_survey_responses_client (client_id, submitted_at),
  INDEX idx_survey_responses_respondent (respondent_user_id, submitted_at),
  INDEX idx_survey_responses_push (survey_push_id),
  CONSTRAINT fk_survey_responses_survey
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  CONSTRAINT fk_survey_responses_push
    FOREIGN KEY (survey_push_id) REFERENCES survey_pushes(id) ON DELETE SET NULL,
  CONSTRAINT fk_survey_responses_respondent
    FOREIGN KEY (respondent_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_survey_responses_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
