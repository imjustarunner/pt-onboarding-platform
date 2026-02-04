-- Custom intake fields and bundled PDF support
ALTER TABLE intake_links
  ADD COLUMN intake_fields JSON NULL AFTER allowed_document_template_ids;

ALTER TABLE intake_submissions
  ADD COLUMN intake_data JSON NULL AFTER signer_phone,
  ADD COLUMN combined_pdf_path VARCHAR(1024) NULL AFTER guardian_user_id,
  ADD COLUMN combined_pdf_hash VARCHAR(128) NULL AFTER combined_pdf_path;
