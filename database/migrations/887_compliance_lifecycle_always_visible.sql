-- Migration 887: Always show compliance document lifecycle items on employee profiles
-- Document-linked compliance steps (Employment Agreement, Job Description Acknowledgement,
-- W-4, I-9, etc.) were scope_mode='assigned', so they only appeared after a package or
-- document task explicitly scoped the user. HR expects these as baseline checklist rows.

UPDATE lifecycle_checklist_definitions
SET scope_mode = 'always'
WHERE agency_id IS NULL
  AND phase = 'onboarding'
  AND category = 'compliance_documents';
