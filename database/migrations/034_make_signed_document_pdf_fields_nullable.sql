-- Migration: Make signed_pdf_path and pdf_hash nullable in signed_documents table
-- Description: These fields should be NULL during consent phase, then populated when document is finalized

ALTER TABLE signed_documents 
  MODIFY COLUMN signed_pdf_path VARCHAR(500) NULL,
  MODIFY COLUMN pdf_hash VARCHAR(64) NULL;

