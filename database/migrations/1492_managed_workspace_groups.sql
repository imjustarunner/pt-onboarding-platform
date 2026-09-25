-- One shared identity for a managed Google Group, email contact, chat channel,
-- and meeting invite group. Self-service tenants are not enrolled implicitly.
CREATE TABLE IF NOT EXISTS managed_workspace_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  group_key VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  label VARCHAR(255) NOT NULL,
  contact_id INT NULL,
  chat_thread_id INT NULL,
  meeting_group_id INT NULL,
  manager_user_ids JSON NULL,
  member_emails JSON NULL,
  last_synced_at DATETIME NULL,
  UNIQUE KEY uq_managed_group (agency_id, group_key),
  UNIQUE KEY uq_managed_group_email (email),
  UNIQUE KEY uq_managed_group_chat (chat_thread_id),
  UNIQUE KEY uq_managed_group_meeting (meeting_group_id),
  CONSTRAINT fk_managed_group_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);
