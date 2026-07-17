-- Migration 969: Rename prep_for_outreach to Prep or attendance of outreach
UPDATE payroll_indirect_service_types
SET label = 'Prep or attendance of outreach',
    description = 'Prepare for or attend community/outreach activities'
WHERE type_key = 'prep_for_outreach';
