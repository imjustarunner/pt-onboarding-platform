-- Library PDFs belong to the overarching program (company_events.organization_id), not each nested event.
-- Attachments to sessions still use company_event_id on the session row.

ALTER TABLE skill_builders_event_program_documents
  ADD COLUMN program_organization_id INT NULL DEFAULT NULL
    COMMENT 'Program org agencies.id — shared across nested company events under this program'
    AFTER agency_id,
  ADD INDEX idx_sb_prog_docs_prog_org (program_organization_id),
  ADD INDEX idx_sb_prog_docs_agency_prog (agency_id, program_organization_id);

UPDATE skill_builders_event_program_documents d
INNER JOIN company_events ce ON ce.id = d.company_event_id AND ce.agency_id = d.agency_id
SET d.program_organization_id = ce.organization_id
WHERE d.program_organization_id IS NULL AND ce.organization_id IS NOT NULL;

UPDATE skill_builders_event_program_documents d
INNER JOIN skills_groups sg ON sg.company_event_id = d.company_event_id AND sg.agency_id = d.agency_id
SET d.program_organization_id = sg.skill_builders_program_organization_id
WHERE d.program_organization_id IS NULL AND sg.skill_builders_program_organization_id IS NOT NULL;

DELETE FROM skill_builders_event_program_documents WHERE program_organization_id IS NULL;

ALTER TABLE skill_builders_event_program_documents
  MODIFY COLUMN program_organization_id INT NOT NULL,
  MODIFY COLUMN company_event_id INT NULL DEFAULT NULL,
  MODIFY COLUMN skills_group_id INT NULL DEFAULT NULL;

ALTER TABLE skill_builders_event_program_documents
  ADD CONSTRAINT fk_sb_prog_docs_prog_org
  FOREIGN KEY (program_organization_id) REFERENCES agencies(id) ON DELETE CASCADE;
