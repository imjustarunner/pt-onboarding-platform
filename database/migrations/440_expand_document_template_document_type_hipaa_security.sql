-- Migration: Expand document_templates.document_type enum for HIPAA Security
-- Purpose: allow uploading/creating templates with document_type='hipaa_security'

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
  'administrative'
) DEFAULT 'administrative';

