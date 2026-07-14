-- Migration 915: Expand Environment & Home reflection options for Life Balance Wheel
UPDATE life_balance_template_categories
SET questions_json = JSON_OBJECT(
  'scorePrompt', 'How satisfied are you with your environment and home life right now?',
  'followUp', 'What changes would most improve this area?',
  'options', JSON_ARRAY(
    'Organization',
    'Comfort',
    'Safety',
    'Privacy',
    'Less clutter',
    'Better routines',
    'Household responsibilities',
    'Workspace',
    'Location',
    'Other'
  )
)
WHERE category_key = 'environmentHome'
  AND template_id IN (
    SELECT id FROM (
      SELECT id FROM life_balance_templates
      WHERE agency_id IS NULL AND name = 'Life Balance Wheel (Default)'
    ) AS t
  );
