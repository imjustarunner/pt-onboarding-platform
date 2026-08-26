-- Migration 1306: rebind misattributed Note Aid drafts to the client's tenant
-- Drafts created under the workspace agency (e.g. ITSCO) while linked to a
-- single-tenant client (e.g. NLU) should belong to the client's agency.

UPDATE clinical_note_drafts d
INNER JOIN clients c
  ON c.id = d.client_id
 AND c.agency_id IS NOT NULL
 AND d.agency_id <> c.agency_id
LEFT JOIN client_agency_assignments caa
  ON caa.client_id = c.id
 AND caa.agency_id = d.agency_id
 AND caa.is_active = TRUE
SET d.agency_id = c.agency_id
WHERE caa.client_id IS NULL;
