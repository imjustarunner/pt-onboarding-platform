-- Migration 1037: clarify needs assessment capacity guidance (5–7 clients per day)
UPDATE school_reinit_question_configs
SET
  label = REPLACE(
    label,
    'About how many days per week will you need',
    'How many days per week will you need'
  ),
  help_text = 'Each full day on-site, a provider can typically see 5–7 clients. Example: 2 days ≈ 10–14 clients per week.'
WHERE question_key = 'days_per_week_onsite'
  AND section_key = 'needs_assessment';

UPDATE school_reinit_question_configs
SET
  label = 'Anything else about your provider or schedule needs?',
  help_text = 'e.g. need more/fewer days, Spanish-speaking clinician, preferred days, or other special requests.'
WHERE question_key = 'provider_preferences'
  AND section_key = 'needs_assessment';
