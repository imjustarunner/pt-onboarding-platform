-- Migration 989: named staff invite groups for team meetings
CREATE TABLE IF NOT EXISTS agency_meeting_invite_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_meeting_invite_groups_agency (agency_id),
  CONSTRAINT fk_meeting_invite_groups_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_meeting_invite_group_members (
  group_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (group_id, user_id),
  INDEX idx_meeting_invite_group_members_user (user_id),
  CONSTRAINT fk_meeting_invite_group_members_group
    FOREIGN KEY (group_id) REFERENCES agency_meeting_invite_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_meeting_invite_group_members_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
