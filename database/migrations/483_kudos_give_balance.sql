-- Track kudos allowance users can give each month (with rollover cap)

CREATE TABLE IF NOT EXISTS user_kudos_give_balance (
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  balance TINYINT UNSIGNED NOT NULL DEFAULT 1,
  last_refill_month DATE NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, agency_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);
