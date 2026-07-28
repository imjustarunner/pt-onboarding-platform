-- Migration 1066: link team meetings / huddles to agency meeting invite groups
CREATE TABLE IF NOT EXISTS provider_schedule_event_invite_groups (
  event_id INT NOT NULL,
  invite_group_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, invite_group_id),
  INDEX idx_pse_invite_groups_group (invite_group_id),
  CONSTRAINT fk_pse_invite_groups_event
    FOREIGN KEY (event_id) REFERENCES provider_schedule_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_pse_invite_groups_group
    FOREIGN KEY (invite_group_id) REFERENCES agency_meeting_invite_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
