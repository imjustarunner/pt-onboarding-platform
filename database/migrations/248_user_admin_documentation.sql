-- Migration: Admin Documentation for provider profiles
-- Purpose:
--   1) Store HR/remediation/admin-only documentation entries per user (note or uploaded file)
--   2) Allow metadata visibility broadly while content requires admin/creator/grant
--   3) Support access request + approval + time-limited grants
--   4) Audit “open/view” events for compliance

CREATE TABLE IF NOT EXISTS user_admin_docs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  doc_type VARCHAR(120) NULL,
  note_text MEDIUMTEXT NULL,
  storage_path VARCHAR(512) NULL,
  original_name VARCHAR(255) NULL,
  mime_type VARCHAR(128) NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_admin_docs_user_id (user_id),
  INDEX idx_user_admin_docs_created_at (created_at),
  INDEX idx_user_admin_docs_created_by (created_by_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_admin_doc_access_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  doc_id INT NULL,
  requested_by_user_id INT NOT NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by_user_id INT NULL,
  reviewed_at TIMESTAMP NULL,
  INDEX idx_uad_req_user_id (user_id),
  INDEX idx_uad_req_doc_id (doc_id),
  INDEX idx_uad_req_requested_by (requested_by_user_id),
  INDEX idx_uad_req_status (status),
  INDEX idx_uad_req_requested_at (requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_admin_doc_access_grants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  doc_id INT NULL,
  grantee_user_id INT NOT NULL,
  granted_by_user_id INT NOT NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  revoked_at TIMESTAMP NULL,
  revoked_by_user_id INT NULL,
  INDEX idx_uad_grant_user_id (user_id),
  INDEX idx_uad_grant_doc_id (doc_id),
  INDEX idx_uad_grant_grantee (grantee_user_id),
  INDEX idx_uad_grant_expires_at (expires_at),
  INDEX idx_uad_grant_revoked_at (revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_admin_doc_access_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NOT NULL,
  viewer_user_id INT NOT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  INDEX idx_uad_log_doc_id (doc_id),
  INDEX idx_uad_log_viewer (viewer_user_id),
  INDEX idx_uad_log_opened_at (opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

