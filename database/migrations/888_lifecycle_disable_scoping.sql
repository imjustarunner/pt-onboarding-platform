-- Migration 888: Disable lifecycle scoping for onboarding (show all checklist items)
-- All onboarding rows are visible on every applicable profile. Scoping records in
-- user_lifecycle_scoped_items are kept for audit/future use but no longer gate visibility.
-- To re-enable scoping later: set scope_mode='assigned' on manual-only definitions.

UPDATE lifecycle_checklist_definitions
SET scope_mode = 'always'
WHERE agency_id IS NULL
  AND phase = 'onboarding';
