-- Store per-client bundle PDFs for multi-child intake submissions
ALTER TABLE intake_submission_clients
  ADD COLUMN bundle_pdf_path VARCHAR(1024) NULL AFTER contact_phone,
  ADD COLUMN bundle_pdf_hash VARCHAR(128) NULL AFTER bundle_pdf_path;
