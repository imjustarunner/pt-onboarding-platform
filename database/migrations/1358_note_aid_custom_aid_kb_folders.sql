-- Migration 1358: Custom Note Aid reference folders (PDF/TXT learning materials)
ALTER TABLE note_aid_custom_aids
  ADD COLUMN kb_folders JSON NULL COMMENT 'KB folder names for reference PDFs/TXT used by this custom aid'
  AFTER training_notes;
