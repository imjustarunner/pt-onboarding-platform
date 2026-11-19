CREATE TABLE IF NOT EXISTS portal_assignment_packages (
 id INT AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 name VARCHAR(100) NOT NULL,
 school_only BOOLEAN NOT NULL DEFAULT FALSE,
 selection_json JSON NOT NULL,
 created_by_user_id INT NOT NULL,
 UNIQUE KEY agency_package_name (agency_id,name)
);
CREATE TABLE IF NOT EXISTS portal_message_alert_cursors (
 user_id INT PRIMARY KEY,
 last_message_id BIGINT NOT NULL DEFAULT 0
);
-- Establish the rollout boundary once. Subsequent visits keep their own cursor.
INSERT IGNORE INTO portal_message_alert_cursors (user_id,last_message_id)
SELECT 0,COALESCE(MAX(id),0) FROM chat_messages;
