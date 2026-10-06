-- School staff read state is per email, independent of staff inbox ownership and delivery subscription.
CREATE TABLE IF NOT EXISTS school_portal_email_reads (
  school_organization_id INT NOT NULL,
  user_id INT NOT NULL,
  message_key CHAR(64) NOT NULL,
  read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (school_organization_id, user_id, message_key),
  CONSTRAINT fk_school_email_read_school FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_email_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
