-- Migration 1311: Unified Inbox Phase 2 — personal mailboxes + communication prefs
-- Personal app inboxes (no new Workspace seats) and opt-in personal-email digests.

ALTER TABLE communication_inboxes
  ADD COLUMN owner_user_id INT NULL
    COMMENT 'User who owns a kind=personal inbox'
    AFTER kind;

ALTER TABLE communication_inboxes
  ADD INDEX idx_comm_inbox_owner (owner_user_id);

ALTER TABLE communication_inboxes
  ADD CONSTRAINT fk_comm_inbox_owner
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS user_communication_prefs (
  user_id INT NOT NULL,
  personal_email_notify TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Opt-in: digest/alerts to users.personal_email',
  digest_hours SMALLINT NOT NULL DEFAULT 48
    COMMENT '24 or 48 — delay before personal digest for stale needs_reply/follow_up',
  last_inbox_digest_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_comm_prefs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
