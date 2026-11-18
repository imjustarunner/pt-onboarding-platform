CREATE TABLE IF NOT EXISTS narriva_generator_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  configuration_json JSON NOT NULL,
  updated_by_user_id INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO narriva_generator_settings (id, version, configuration_json) VALUES (1, 1, JSON_OBJECT());
CREATE TABLE IF NOT EXISTS narriva_generator_settings_versions (
  version INT UNSIGNED NOT NULL PRIMARY KEY,
  configuration_json JSON NOT NULL,
  change_reason VARCHAR(2000) NOT NULL,
  actor_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS narriva_generator_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tool_id VARCHAR(96) NOT NULL,
  settings_version INT UNSIGNED NOT NULL,
  feedback_text TEXT NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
