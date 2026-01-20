-- Payroll: configurable titles for Other rate slots (1/2/3)
-- Agency provides defaults; optionally overridden per user.

CREATE TABLE IF NOT EXISTS payroll_other_rate_titles (
  agency_id INT NOT NULL,
  title_1 VARCHAR(64) NOT NULL DEFAULT 'Other 1',
  title_2 VARCHAR(64) NOT NULL DEFAULT 'Other 2',
  title_3 VARCHAR(64) NOT NULL DEFAULT 'Other 3',
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_user_other_rate_titles (
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  title_1 VARCHAR(64) NULL,
  title_2 VARCHAR(64) NULL,
  title_3 VARCHAR(64) NULL,
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_payroll_user_other_titles_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

