-- Migration: Expand document_templates.document_type enum for School
-- Purpose: allow creating templates with document_type='school' for school-scoped intake documents

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
  'administrative'
) DEFAULT 'administrative';
