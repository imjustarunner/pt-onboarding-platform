-- Migration: Add program modules relationship
-- Description: Add program_id to modules table for program-level ownership

ALTER TABLE modules
ADD COLUMN program_id INT NULL AFTER agency_id,
ADD FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
ADD INDEX idx_program (program_id);

