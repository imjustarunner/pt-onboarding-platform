-- Migration: Fix signed_at field default value
-- Description: Ensure signed_at field has a default value to work correctly with prepared statements

ALTER TABLE signed_documents 
  MODIFY COLUMN signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

