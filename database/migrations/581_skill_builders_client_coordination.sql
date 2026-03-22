-- Skill Builders: coordinator readiness per skills-group membership, client-level intake/TP flags,
-- non-guardian transport approvals, and optional company_event scoped chat threads.
-- NOTE: Avoid semicolons inside COMMENT strings; migration runner splits on `;`.

ALTER TABLE skills_group_clients
  ADD COLUMN active_for_providers TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Providers see client when 1'
    AFTER created_at,
  ADD COLUMN ready_confirmed_by_user_id INT NULL DEFAULT NULL
    AFTER active_for_providers,
  ADD COLUMN ready_confirmed_at DATETIME NULL DEFAULT NULL
    AFTER ready_confirmed_by_user_id,
  ADD INDEX idx_skills_group_clients_active (skills_group_id, active_for_providers),
  ADD CONSTRAINT fk_skills_group_clients_ready_user
    FOREIGN KEY (ready_confirmed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

UPDATE skills_group_clients SET active_for_providers = 1 WHERE active_for_providers = 0;

ALTER TABLE clients
  ADD COLUMN skill_builders_intake_complete TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'SB intake paperwork ready'
    AFTER skills;

ALTER TABLE clients
  ADD COLUMN skill_builders_treatment_plan_complete TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Treatment plan ready for coordinator'
    AFTER skill_builders_intake_complete;

CREATE TABLE IF NOT EXISTS skill_builders_transport_pickups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  relationship VARCHAR(128) NULL,
  phone VARCHAR(64) NULL,
  notes VARCHAR(500) NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sb_transport_client (client_id, agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE chat_threads
  ADD COLUMN company_event_id INT NULL DEFAULT NULL
    COMMENT 'Skill Builders event chat thread'
    AFTER organization_id,
  ADD UNIQUE INDEX uniq_chat_threads_skill_builders_event (company_event_id),
  ADD CONSTRAINT fk_chat_threads_company_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE SET NULL;
