-- Migration: Expand document_templates.document_type enum for audio recording consent
-- Purpose: allow uploading/creating templates with document_type='audio_recording_consent'

ALTER TABLE document_templates
MODIFY COLUMN document_type ENUM(
  'acknowledgment',
  'authorization',
  'agreement',
  'compliance',
  'disclosure',
  'consent',
  'audio_recording_consent',
  'administrative'
) DEFAULT 'administrative';

