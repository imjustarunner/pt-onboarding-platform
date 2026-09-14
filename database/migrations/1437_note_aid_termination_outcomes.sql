ALTER TABLE kudos
  MODIFY COLUMN source ENUM('peer', 'notes_complete', 'treatment_goals_achieved') NOT NULL DEFAULT 'peer';

-- No client names, identifiers, or clinical narrative in recognition/statistics.
-- Clinical note IDs are internal idempotency references and are never exposed in aggregate reports.
CREATE TABLE IF NOT EXISTS note_aid_termination_outcomes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  clinical_note_id INT NOT NULL,
  root_note_id INT NOT NULL,
  reason VARCHAR(40) NOT NULL,
  terminated_at DATETIME NOT NULL,
  UNIQUE KEY uq_termination_root (agency_id, root_note_id),
  INDEX idx_termination_provider (agency_id, provider_user_id, reason, terminated_at),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
