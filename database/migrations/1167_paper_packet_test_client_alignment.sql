-- Migration 1167: Align paper-packet flags and sources for onboarding test clients.
-- Packet checklist + ROI staff steps only apply to paper-upload clients.

-- School clients in PACKET workflow but missing upload source → treat as internal paper upload.
UPDATE clients c
SET c.source = 'SCHOOL_UPLOAD_INTERNAL'
WHERE LOWER(COALESCE(c.client_type, '')) = 'school'
  AND UPPER(COALESCE(c.source, '')) NOT IN ('SCHOOL_UPLOAD', 'SCHOOL_UPLOAD_INTERNAL')
  AND (
    UPPER(COALESCE(c.status, '')) = 'PACKET'
    OR UPPER(COALESCE(c.document_status, '')) = 'PACKET'
  );

-- Clear paper-packet ROI pending on clients that are not paper uploads.
UPDATE clients
SET paper_packet_staff_roi_pending = 0
WHERE paper_packet_staff_roi_pending = 1
  AND UPPER(COALESCE(source, '')) NOT IN ('SCHOOL_UPLOAD', 'SCHOOL_UPLOAD_INTERNAL')
  AND UPPER(COALESCE(status, '')) <> 'PACKET'
  AND UPPER(COALESCE(document_status, '')) <> 'PACKET';

-- Remove packet-doc verification JSON from non-paper-packet clients.
UPDATE clients
SET onboarding_docs_json = NULL
WHERE onboarding_docs_json IS NOT NULL
  AND UPPER(COALESCE(source, '')) NOT IN ('SCHOOL_UPLOAD', 'SCHOOL_UPLOAD_INTERNAL')
  AND UPPER(COALESCE(status, '')) <> 'PACKET'
  AND UPPER(COALESCE(document_status, '')) <> 'PACKET';
