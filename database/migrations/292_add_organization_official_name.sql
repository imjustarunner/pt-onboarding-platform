-- Migration: Add "official_name" for organizations (especially schools)
-- Purpose:
-- - Store a display-friendly official name (e.g., "Ashley Elementary")
-- - Keep legacy short/internal "name" unchanged if desired

ALTER TABLE agencies
  ADD COLUMN official_name VARCHAR(255) NULL;

