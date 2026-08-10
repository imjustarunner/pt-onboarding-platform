-- Migration 1163: Paper packets before 2026-08-09 use 1-year ROI (not 3).
-- Migration 1162 backfilled active grants to +3 years; correct paper-upload / PACKET clients
-- whose first ROI grant was before the 3-year paper default start date.

UPDATE clients c
JOIN (
  SELECT a.client_id, MIN(a.granted_at) AS first_granted_at
  FROM client_school_staff_roi_access a
  WHERE a.is_active = 1
    AND LOWER(COALESCE(a.access_level, '')) IN ('roi', 'roi_docs')
  GROUP BY a.client_id
) g ON g.client_id = c.id
SET c.roi_expires_at = DATE_ADD(DATE(g.first_granted_at), INTERVAL 1 YEAR)
WHERE DATE(g.first_granted_at) < '2026-08-09'
  AND (
    UPPER(COALESCE(c.source, '')) IN ('SCHOOL_UPLOAD', 'SCHOOL_UPLOAD_INTERNAL')
    OR UPPER(COALESCE(c.status, '')) = 'PACKET'
    OR UPPER(COALESCE(c.document_status, '')) = 'PACKET'
  )
  AND (
    c.roi_expires_at IS NULL
    OR c.roi_expires_at = DATE_ADD(DATE(g.first_granted_at), INTERVAL 3 YEAR)
  );
