-- Migration 1255: external source_ref for Gmail + communications backfill
ALTER TABLE school_support_reply_embeddings
  ADD COLUMN source_ref VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Stable dedupe key: library:12, ticket:34, gmail:msgId, comm:56',
  MODIFY COLUMN source_id INT NULL DEFAULT NULL
    COMMENT 'Optional numeric source id when available';

UPDATE school_support_reply_embeddings
SET source_ref = CONCAT(source_type, ':', source_id)
WHERE source_ref IS NULL AND source_id IS NOT NULL;

ALTER TABLE school_support_reply_embeddings
  DROP INDEX uq_ssre_source,
  ADD UNIQUE KEY uq_ssre_agency_source_ref (agency_id, source_ref);
