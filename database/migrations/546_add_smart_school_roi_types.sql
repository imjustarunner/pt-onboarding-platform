-- Migration: add smart school ROI types for digital forms and document templates
-- Description:
-- 1) intake_links.form_type gets smart_school_roi for client-bound school ROI flows
-- 2) document_templates.document_type gets school_roi for dedicated ROI documents

ALTER TABLE intake_links
  MODIFY COLUMN form_type ENUM('intake', 'public_form', 'job_application', 'medical_records_request', 'smart_school_roi') NOT NULL DEFAULT 'intake';

ALTER TABLE document_templates
  MODIFY COLUMN document_type ENUM(
    'acknowledgment',
    'authorization',
    'agreement',
    'compliance',
    'disclosure',
    'consent',
    'audio_recording_consent',
    'hipaa_security',
    'school',
    'school_roi',
    'administrative'
  ) DEFAULT 'administrative';
