-- Migration 1350: Tag uploaded job-application cover letters as doc_type cover_letter
-- so hiring UI can surface them (they were stored as application_material).

UPDATE user_admin_docs
SET doc_type = 'cover_letter'
WHERE (is_deleted = 0 OR is_deleted IS NULL)
  AND doc_type = 'application_material'
  AND (
    LOWER(COALESCE(title, '')) LIKE '%cover%'
    OR LOWER(COALESCE(original_name, '')) LIKE '%cover%'
  );
