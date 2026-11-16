-- Private, encrypted pre-client draft. Names and pasted records never go to browser storage.
CREATE TABLE IF NOT EXISTS client_creation_drafts (
 agency_id INT NOT NULL,
 owner_user_id INT NOT NULL,
 payload_enc JSON NOT NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (agency_id,owner_user_id),
 CONSTRAINT fk_creation_draft_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
 CONSTRAINT fk_creation_draft_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
