-- Migration 1319: Lifecycle checklist item for staff client comfort preferences (Track B)

INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, description, phase, category, order_index, applies_to, integration_type, integration_ref, is_platform_template)
SELECT
  'tutoring_comfort_preferences',
  'Staff Client Comfort Preferences',
  'Complete specialties, age/grade comfort, service types, and assessment tools for tutoring matching.',
  'onboarding',
  'orientation',
  95,
  'all',
  'manual',
  NULL,
  1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle_checklist_definitions
  WHERE item_key = 'tutoring_comfort_preferences' AND agency_id IS NULL
);
