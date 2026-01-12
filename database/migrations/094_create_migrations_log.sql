-- Migration: Create migrations_log table for tracking executed migrations
-- Description: This table tracks which migrations have been run and when

CREATE TABLE IF NOT EXISTS migrations_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  execution_time_ms INT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  INDEX idx_migration_name (migration_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
