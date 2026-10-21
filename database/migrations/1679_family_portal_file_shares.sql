-- A file is shared with a named account after staff review; no chart-wide
-- sharing defaults and no invitation or email side effects.
CREATE TABLE IF NOT EXISTS family_portal_file_shares (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 document_id INT NOT NULL, client_id INT NOT NULL, agency_id INT NOT NULL,
 recipient_user_id INT NOT NULL, shared_by_user_id INT NOT NULL,
 file_key_hash CHAR(64) NOT NULL,
 shared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_at DATETIME NULL,
 UNIQUE KEY file_recipient (document_id,recipient_user_id),
 INDEX recipient_client (recipient_user_id,client_id,revoked_at)
);
