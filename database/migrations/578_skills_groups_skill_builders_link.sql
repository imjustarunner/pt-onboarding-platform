-- Link school skills groups to Skill Builders program org and integrated company_events.

ALTER TABLE skills_groups
  ADD COLUMN skill_builders_program_organization_id INT NULL DEFAULT NULL
    COMMENT 'Affiliated Skill Builders program (agencies.id)'
    AFTER agency_id,
  ADD COLUMN company_event_id INT NULL DEFAULT NULL
    COMMENT 'Program-scoped company_events row synced from this group'
    AFTER skill_builders_program_organization_id,
  ADD INDEX idx_skills_groups_sb_program (skill_builders_program_organization_id),
  ADD UNIQUE INDEX uniq_skills_groups_company_event (company_event_id),
  ADD CONSTRAINT fk_skills_groups_sb_program_org
    FOREIGN KEY (skill_builders_program_organization_id) REFERENCES agencies(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_skills_groups_company_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE SET NULL;

-- Backfill existing rows: node backend/src/scripts/backfillSkillsGroupsCompanyEvents.js
