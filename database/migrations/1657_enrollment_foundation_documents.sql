CREATE TABLE IF NOT EXISTS enrollment_foundation_documents (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 channel VARCHAR(24) NOT NULL,
 locale VARCHAR(8) NOT NULL,
 audience VARCHAR(12) NOT NULL DEFAULT 'all',
 document_key VARCHAR(120) NOT NULL,
 content_html MEDIUMTEXT NOT NULL,
 version INT NOT NULL DEFAULT 1,
 updated_by_user_id INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_enrollment_foundation (agency_id,channel,locale,audience,document_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS enrollment_foundation_document_versions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 document_id BIGINT UNSIGNED NOT NULL,
 version INT NOT NULL,
 content_html MEDIUMTEXT NOT NULL,
 actor_user_id INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_enrollment_foundation_version(document_id,version),
 FOREIGN KEY(document_id) REFERENCES enrollment_foundation_documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
