-- Migration: Add terminology_settings to agencies table
-- Description: Allow agencies to override platform-wide terminology

ALTER TABLE agencies
ADD COLUMN terminology_settings JSON NULL AFTER color_palette;

