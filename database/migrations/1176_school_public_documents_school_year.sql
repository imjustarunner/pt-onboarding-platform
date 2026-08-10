-- Migration 1176: add school_year to school_public_documents
-- Allows documents to be tagged to a school year (e.g. '2026-2027') so the
-- portal can display current-year docs by default and archive older ones.

ALTER TABLE school_public_documents
  ADD COLUMN school_year VARCHAR(9) NULL DEFAULT NULL
  COMMENT 'School year this document belongs to, e.g. 2026-2027. NULL = evergreen/unspecified.';

-- Auto-detect school year from existing document titles and filenames
UPDATE school_public_documents SET school_year = '2024-2025'
WHERE school_year IS NULL
  AND (title LIKE '%2024-2025%' OR title LIKE '%2024/2025%'
    OR original_filename LIKE '%2024-2025%' OR original_filename LIKE '%2024/2025%');

UPDATE school_public_documents SET school_year = '2025-2026'
WHERE school_year IS NULL
  AND (title LIKE '%2025-2026%' OR title LIKE '%2025/2026%'
    OR original_filename LIKE '%2025-2026%' OR original_filename LIKE '%2025/2026%');

UPDATE school_public_documents SET school_year = '2026-2027'
WHERE school_year IS NULL
  AND (title LIKE '%2026-2027%' OR title LIKE '%2026/2027%'
    OR original_filename LIKE '%2026-2027%' OR original_filename LIKE '%2026/2027%');
