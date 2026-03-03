-- Add form_type to intake_links for public standalone forms (e.g. additional driver, consent for audio).
-- 'intake' = person-tied (creates client, documents assigned to client)
-- 'public_form' = standalone (externally clickable, no person tied; documents land in unassigned)
ALTER TABLE intake_links
  ADD COLUMN form_type ENUM('intake', 'public_form') NOT NULL DEFAULT 'intake' AFTER scope_type;
