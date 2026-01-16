-- Migration: Expand clients.initials to support identifier-style values
-- Purpose: allow de-identified identifier names with numeric suffixes

ALTER TABLE clients
  MODIFY COLUMN initials VARCHAR(32) NOT NULL COMMENT 'Client initials / identifier for school view';

