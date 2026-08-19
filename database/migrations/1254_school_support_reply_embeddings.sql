-- Migration 1254: Semantic retrieval embeddings for school support replies (Phase 5)
CREATE TABLE school_support_reply_embeddings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  school_organization_id INT NULL DEFAULT NULL,
  intent_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  source_type VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'library | ticket_answer',
  source_id INT NOT NULL COMMENT 'school_support_reply_library.id or support_tickets.id',
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  search_text TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'De-identified text used to build the embedding',
  reply_excerpt TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'De-identified reply body surfaced in AI prompts',
  embedding_json JSON NOT NULL COMMENT 'Float vector from embedding model',
  embedding_model VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  content_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ssre_source (agency_id, source_type, source_id),
  KEY idx_ssre_agency_active (agency_id, is_active, intent_key),
  KEY idx_ssre_school (school_organization_id),
  CONSTRAINT fk_ssre_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssre_school FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
