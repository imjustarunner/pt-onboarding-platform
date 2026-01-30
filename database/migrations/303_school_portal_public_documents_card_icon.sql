-- Migration: add School Portal Public Documents card icon to agencies
-- Purpose: allow agency-level branding overrides for the new school portal "Public documents" card.

ALTER TABLE agencies
  ADD COLUMN school_portal_public_documents_icon_id INT NULL AFTER school_portal_upload_packet_icon_id;

