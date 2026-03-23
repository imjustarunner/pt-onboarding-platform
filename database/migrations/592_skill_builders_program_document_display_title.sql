-- Optional user-facing title for program library PDFs (attach dropdowns).

ALTER TABLE skill_builders_event_program_documents
  ADD COLUMN display_title VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Shown when attaching to sessions, falls back to original_filename when null'
    AFTER original_filename;
