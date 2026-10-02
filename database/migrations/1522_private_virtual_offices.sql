-- Three access tiers. No prices or existing billing features are changed.
CREATE TABLE IF NOT EXISTS meeting_access_plans (
 user_id INT NOT NULL PRIMARY KEY,
 tier ENUM('basic','premium','premium_plus') NOT NULL DEFAULT 'basic',
 source VARCHAR(64) NOT NULL DEFAULT 'assigned',
 updated_by_user_id INT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
-- Freeze the launch population once, including on migration retry.
CREATE TABLE IF NOT EXISTS meeting_plan_launch_grant (
 id TINYINT PRIMARY KEY,max_user_id INT NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT IGNORE INTO meeting_plan_launch_grant (id,max_user_id) SELECT 1,COALESCE(MAX(id),0) FROM users;
INSERT IGNORE INTO meeting_access_plans (user_id,tier,source)
 SELECT id,'premium_plus','existing_account_launch_grant' FROM users WHERE id<=(SELECT max_user_id FROM meeting_plan_launch_grant WHERE id=1);
CREATE TABLE IF NOT EXISTS meeting_access_plan_events (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL,tier VARCHAR(32) NOT NULL,
 actor_user_id INT NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS private_virtual_office_sessions (
 room_id INT NOT NULL PRIMARY KEY, video_session_id VARCHAR(512) NULL,
 generation INT NOT NULL DEFAULT 0, host_seen_at DATETIME NULL
);
CREATE TABLE IF NOT EXISTS private_virtual_office_visits (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,room_id INT NOT NULL,generation INT NULL,
 credential_hash CHAR(64) NOT NULL UNIQUE,display_name VARCHAR(120) NOT NULL,
 photo_envelope MEDIUMTEXT NULL,
 status ENUM('waiting','admitted','dismissed','ended') NOT NULL DEFAULT 'waiting',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at DATETIME NOT NULL,admitted_at DATETIME NULL,
 INDEX office_visits(room_id,status,expires_at)
);
CREATE TABLE IF NOT EXISTS meeting_calendar_guests (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,meeting_type ENUM('supervision','team-meeting') NOT NULL,
 meeting_id INT NOT NULL,credential_hash CHAR(64) NOT NULL UNIQUE,display_name VARCHAR(120) NOT NULL,
 status ENUM('waiting','admitted','left') NOT NULL DEFAULT 'waiting',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at DATETIME NOT NULL,INDEX calendar_guest_meeting(meeting_type,meeting_id,status)
);
