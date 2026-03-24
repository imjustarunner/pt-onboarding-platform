-- Activities tied to a program library PDF; when that PDF is attached to a session, Clinical Aid uses these first.

ALTER TABLE skill_builders_activity_options
  ADD COLUMN program_document_id INT NULL DEFAULT NULL
    COMMENT 'skill_builders_event_program_documents.id — checklist for this library PDF'
    AFTER session_id,
  ADD INDEX idx_sb_actopt_prog_doc (program_document_id),
  ADD CONSTRAINT fk_sb_actopt_prog_doc
    FOREIGN KEY (program_document_id) REFERENCES skill_builders_event_program_documents(id) ON DELETE CASCADE;

ALTER TABLE skill_builders_activity_options
  MODIFY skills_group_id INT NULL
    COMMENT 'NULL when row is scoped to program_document_id only';
