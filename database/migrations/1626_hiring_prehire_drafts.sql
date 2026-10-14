CREATE TABLE IF NOT EXISTS hiring_prehire_drafts (
  agency_id INT NOT NULL,
  candidate_user_id INT NOT NULL,
  draft_json JSON NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  updated_by_user_id INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, candidate_user_id)
);
