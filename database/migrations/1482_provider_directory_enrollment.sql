-- Directory enrollment is independent of hiring and clinical access.
CREATE TABLE IF NOT EXISTS provider_directory_portals (
 id INT AUTO_INCREMENT PRIMARY KEY,
 slug VARCHAR(100) NOT NULL UNIQUE,
 agency_id INT NOT NULL,
 name VARCHAR(255) NOT NULL,
 website_url VARCHAR(500),
 public_origin VARCHAR(255) NOT NULL DEFAULT 'https://plottwisthq.com',
 heritage_required BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (agency_id) REFERENCES agencies(id)
);
CREATE TABLE IF NOT EXISTS provider_directory_members (
 id INT AUTO_INCREMENT PRIMARY KEY,
 portal_id INT NOT NULL,
 user_id INT NULL,
 email VARCHAR(254) NOT NULL,
 username VARCHAR(80) NOT NULL,
 password_hash VARCHAR(255) NULL,
 member_role ENUM('provider','admin') NOT NULL DEFAULT 'provider',
 email_verified BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 opt_in BOOLEAN NOT NULL DEFAULT FALSE,
 heritage VARCHAR(100) NULL,
 status ENUM('draft','pending','approved','changes_requested','rejected','suspended') NOT NULL DEFAULT 'draft',
 draft_json JSON NULL,
 published_json JSON NULL,
 photo_url VARCHAR(700) NULL,
 revision INT NOT NULL DEFAULT 0,
 review_note TEXT NULL,
 reviewed_by INT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY directory_email (portal_id,email),
 UNIQUE KEY directory_username (portal_id,username),
 UNIQUE KEY directory_platform_user (portal_id,user_id),
 INDEX directory_public (portal_id,opt_in,is_active,status),
 FOREIGN KEY (portal_id) REFERENCES provider_directory_portals(id),
 FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS provider_directory_sessions (
 token_hash CHAR(64) PRIMARY KEY,
 member_id INT NOT NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY (member_id) REFERENCES provider_directory_members(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS provider_directory_tokens (
 token_hash CHAR(64) PRIMARY KEY,
 member_id INT NOT NULL,
 purpose ENUM('verify','reset') NOT NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY (member_id) REFERENCES provider_directory_members(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS provider_directory_reviews (
 id INT AUTO_INCREMENT PRIMARY KEY,
 member_id INT NOT NULL,
 actor_member_id INT NULL,
 actor_user_id INT NULL,
 action VARCHAR(40) NOT NULL,
 revision INT NOT NULL,
 note TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (member_id) REFERENCES provider_directory_members(id)
);
-- Reuse an existing tenant by its supplied company name. Never attach to ITSCO.
INSERT INTO agencies (name,slug,is_active)
SELECT 'Latinx Therapist Project CO','latinx-therapist-project-co',TRUE
WHERE NOT EXISTS (SELECT 1 FROM agencies WHERE LOWER(TRIM(name)) = 'latinx therapist project co' OR slug = 'latinx-therapist-project-co');
INSERT INTO provider_directory_portals (slug,agency_id,name,website_url,heritage_required)
SELECT 'latinx',id,'Latinx Therapist Project CO','https://latinxtherapistproject.org/',TRUE
FROM agencies WHERE LOWER(TRIM(name)) = 'latinx therapist project co' OR slug = 'latinx-therapist-project-co'
ORDER BY id LIMIT 1
ON DUPLICATE KEY UPDATE slug=VALUES(slug);
