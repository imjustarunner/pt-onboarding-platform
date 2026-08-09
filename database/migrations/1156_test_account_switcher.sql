-- Migration 1156: demo_test_accounts allowlist for Switch Test Account dropdown

CREATE TABLE IF NOT EXISTS demo_test_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  label VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_demo_test_account_user (user_id),
  KEY idx_demo_test_accounts_active_sort (is_active, sort_order),
  CONSTRAINT fk_demo_test_accounts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO demo_test_accounts (user_id, label, sort_order, is_active)
SELECT u.id, v.label, v.sort_order, 1
FROM (
  SELECT 'admin@demtest.com' AS email, 'Admin (Demo Playground)' AS label, 10 AS sort_order
  UNION ALL SELECT 'providerplus@demtest.com', 'Provider Plus', 20
  UNION ALL SELECT 'cpa@demtest.com', 'CPA', 30
  UNION ALL SELECT 'tenantscheduler@demtest.com', 'Tenant Scheduler', 40
  UNION ALL SELECT 'hourly@demtest.com', 'Hourly Worker', 50
  UNION ALL SELECT 'dp3@demtest.com', 'DP3 — Supervisor', 60
  UNION ALL SELECT 'dp1@demtest.com', 'DP1 — Provider (supervisee)', 70
  UNION ALL SELECT 'dp2@demtest.com', 'DP2 — Provider', 80
  UNION ALL SELECT 'dssa@demtest.com', 'DSSA — School Staff Admin', 90
  UNION ALL SELECT 'schoolscheduler@demtest.com', 'School Scheduler', 100
  UNION ALL SELECT 'general@demtest.com', 'General School Staff', 110
  UNION ALL SELECT 'guardian@demtest.com', 'Guardian', 120
  UNION ALL SELECT 'student1@demtest.com', 'Student 1 (self-login)', 130
  UNION ALL SELECT 'student2@demtest.com', 'Student 2 (self-login)', 140
  UNION ALL SELECT 'student3@demtest.com', 'Student 3 (self-login)', 150
) v
JOIN users u ON LOWER(u.email) = LOWER(v.email)
WHERE NOT EXISTS (
  SELECT 1 FROM demo_test_accounts dta WHERE dta.user_id = u.id
);
