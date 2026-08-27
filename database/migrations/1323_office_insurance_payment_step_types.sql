-- Migration 1323: repair office/channel master step types for insurance & payment
-- Remaps legacy type "insurance" → "insurance_info" and ensures package_selection exists
-- in agency_office_intake_masters and agency_channel_intake_masters JSON.

-- Office masters: replace "insurance" type with "insurance_info"
UPDATE agency_office_intake_masters
SET intake_steps = REPLACE(
  REPLACE(intake_steps, '"type":"insurance"', '"type":"insurance_info"'),
  '"type": "insurance"',
  '"type": "insurance_info"'
)
WHERE intake_steps LIKE '%"insurance"%'
  AND intake_steps NOT LIKE '%"insurance_info"%';

-- Channel masters (tutoring, etc.)
UPDATE agency_channel_intake_masters
SET intake_steps = REPLACE(
  REPLACE(intake_steps, '"type":"insurance"', '"type":"insurance_info"'),
  '"type": "insurance"',
  '"type": "insurance_info"'
)
WHERE intake_steps LIKE '%"insurance"%'
  AND intake_steps NOT LIKE '%"insurance_info"%';
