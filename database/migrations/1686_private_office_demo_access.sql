CREATE TABLE IF NOT EXISTS private_office_demo_access (
 room_id INT NOT NULL PRIMARY KEY,
 granted_by_user_id INT NOT NULL,
 expires_at DATETIME NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
