-- Personal read state is independent of ticket ownership and resolution.
CREATE TABLE IF NOT EXISTS support_ticket_reads (
  ticket_id INT NOT NULL,
  user_id INT NOT NULL,
  last_read_at DATETIME(3) NULL,
  forced_unread TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (ticket_id, user_id),
  INDEX idx_support_ticket_reads_user (user_id)
);
